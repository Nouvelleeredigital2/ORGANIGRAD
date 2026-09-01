import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { PgGraphStore } from '../src/state/pgGraphStore.js';

/**
 * P2-14 — écriture concurrente sur la même fiche.
 *
 * Hermétique par défaut : ne tourne QUE si `TEST_DATABASE_URL` est défini.
 *
 * Lancer :
 *   docker run --rm -e POSTGRES_PASSWORD=test -p 15433:5432 postgres:16
 *   TEST_DATABASE_URL=postgres://postgres:test@localhost:15433/postgres \
 *     npm test -- concurrentWrites
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(TEST_DB_URL))('Écritures concurrentes — politique effective', () => {
    let sql: Sql;
    const workspaceId = randomUUID();
    const nodeId = randomUUID();

    beforeAll(async () => {
        sql = postgres(TEST_DB_URL!, { max: 4 });
        await sql`create extension if not exists "pgcrypto"`;
        await sql`create table if not exists public.workspaces (
            id uuid primary key, name text, created_at timestamptz not null default now())`;
        await sql`create table if not exists public.hybrid_nodes (
            id uuid primary key, workspace_id uuid not null, type text not null, nom text not null,
            role_titre text not null default '', parent_id uuid, grade_id text not null default '',
            system_prompt text, skills text[] not null default array[]::text[], mcp_config jsonb,
            notification_channels jsonb, avatar_url text, status text not null default 'IDLE',
            created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
        await sql`create table if not exists public.node_transitions (
            id bigint generated always as identity primary key, workspace_id uuid not null,
            node_id uuid not null, from_status text not null, to_status text not null, payload jsonb,
            actor_kind text not null default 'orchestrator', actor_id text,
            created_at timestamptz not null default now())`;

        await sql`insert into public.workspaces (id, name) values (${workspaceId}, 'concurrence')`;
    });

    afterAll(async () => {
        if (!sql) return;
        await sql`delete from public.node_transitions where workspace_id = ${workspaceId}`;
        await sql`delete from public.hybrid_nodes where workspace_id = ${workspaceId}`;
        await sql`delete from public.workspaces where id = ${workspaceId}`;
        await sql.end({ timeout: 5 });
    });

    it('rejette la seconde écriture avec un conflit et conserve la première', async () => {
        // Deux sessions distinctes sur le même workspace, comme deux onglets ou
        // deux personnes.
        const sessionA = new PgGraphStore(sql, workspaceId, { kind: 'user', id: 'alice' });
        const sessionB = new PgGraphStore(sql, workspaceId, { kind: 'user', id: 'bob' });

        await sessionA.upsertNode({
            id: nodeId,
            type: 'AGENT_IA',
            nom: 'Nom initial',
            roleTitre: 'Rôle initial',
            parentID: null,
            gradeId: 'Expert',
            skills: [],
            status: 'IDLE',
        });

        // 1. Les deux ouvrent la fiche — même état de départ.
        const vueA = await sessionA.get(nodeId);
        const vueB = await sessionB.get(nodeId);
        expect(vueA.nom).toBe('Nom initial');
        expect(vueB.nom).toBe('Nom initial');

        // 2. A modifie le NOM et enregistre.
        await sessionA.upsertNode({ ...vueA, nom: 'Nom corrigé par Alice' });
        expect((await sessionA.get(nodeId)).nom).toBe('Nom corrigé par Alice');

        // 3. B modifie le RÔLE et enregistre. Sa charge porte encore le nom
        //    qu'il avait chargé — il n'a pas touché à ce champ, mais il le
        //    réécrit quand même.
        const ecritureB = sessionB.upsertNode({ ...vueB, roleTitre: 'Rôle corrigé par Bob' });

        // 4. Le verrou optimiste signale le conflit à B.
        await expect(ecritureB).rejects.toMatchObject({ nodeId, expectedUpdatedAt: vueB.updated_at });

        // 5. Et la correction d'Alice a disparu.
        const finale = await sessionA.get(nodeId);
        expect(finale.nom).toBe('Nom corrigé par Alice');
        expect(finale.roleTitre).toBe('Rôle initial');
    });

    it("ne crée pas de journal de transition pour un conflit métier", async () => {
        // Conséquence pratique : ni Alice ni un auditeur ne peuvent savoir
        // après coup qu'une modification a été écrasée. `node_transitions` ne
        // couvre que les changements de STATUT, pas les champs métier.
        const lignes = await sql`
            select count(*)::int as n from public.node_transitions
             where workspace_id = ${workspaceId} and node_id = ${nodeId}`;
        expect(lignes[0]!.n).toBe(0);
    });

    it("refuse une vue périmée même si elle tente d'écrire plus tard", async () => {
        // Précision utile : la politique n'est pas « la modification la plus
        // récente gagne » mais « le dernier ENREGISTREMENT gagne ». Un onglet
        // ouvert depuis une heure écrase une modification faite il y a dix
        // secondes.
        const session = new PgGraphStore(sql, workspaceId, { kind: 'user', id: 'carol' });
        const ancienneVue = await session.get(nodeId); // chargée maintenant

        await session.upsertNode({ ...ancienneVue, nom: 'Modification récente' });
        // `ancienneVue` est désormais périmée — l'enregistrer est refusé.
        await expect(session.upsertNode({ ...ancienneVue, roleTitre: 'Rôle depuis un onglet périmé' }))
            .rejects.toMatchObject({ nodeId, expectedUpdatedAt: ancienneVue.updated_at });

        const finale = await session.get(nodeId);
        expect(finale.nom).toBe('Modification récente');
    });
});
