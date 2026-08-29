import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { PgGraphStore, ConflitDeVersionError, NodeNotFoundError } from '../src/state/pgGraphStore.js';

/**
 * P2-14 — écriture concurrente sur la même fiche.
 *
 * Ce fichier était un test de CARACTÉRISATION : il documentait le « dernier
 * écrivain gagne » silencieux, en attendant qu'une politique soit choisie.
 * La politique retenue le 2026-08-22 est le **verrou optimiste** sur
 * `updated_at` (option 2 de docs/architecture/concurrence-ecritures.md) ; il
 * devient donc un test de CONFORMITÉ, comme prévu.
 *
 * Ce que le verrou fait : supprimer la perte SILENCIEUSE.
 * Ce qu'il ne fait pas : fusionner. Le second auteur est prévenu et doit
 * recharger — mais il n'écrase plus personne sans le savoir.
 *
 * Hermétique par défaut : ne tourne QUE si `TEST_DATABASE_URL` est défini.
 *
 * Lancer :
 *   docker run --rm -e POSTGRES_PASSWORD=test -p 15433:5432 postgres:16
 *   TEST_DATABASE_URL=postgres://postgres:test@localhost:15433/postgres \
 *     npm test -- concurrentWrites
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(TEST_DB_URL))('Écritures concurrentes — verrou optimiste', () => {
    let sql: Sql;
    const workspaceId = randomUUID();

    const noeud = (id: string) => ({
        id,
        type: 'AGENT_IA' as const,
        nom: 'Nom initial',
        roleTitre: 'Rôle initial',
        parentID: null,
        gradeId: 'Expert',
        skills: [],
        status: 'IDLE' as const,
    });

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

    const sessionA = () => new PgGraphStore(sql, workspaceId, { kind: 'user', id: 'alice' });
    const sessionB = () => new PgGraphStore(sql, workspaceId, { kind: 'user', id: 'bob' });

    it("la seconde écriture est REFUSÉE, et la première survit", async () => {
        const id = randomUUID();
        const a = sessionA();
        const b = sessionB();
        await a.upsertNode(noeud(id));

        // Les deux ouvrent la fiche — même état, même jeton de version.
        const vueA = await a.get(id);
        const vueB = await b.get(id);
        expect(vueA.updatedAt).toBeTruthy();
        expect(vueB.updatedAt).toBe(vueA.updatedAt);

        // Alice corrige le NOM et enregistre.
        await a.upsertNode({ ...vueA, nom: 'Nom corrigé par Alice' }, vueA.updatedAt);

        // Bob corrige le RÔLE. Sa charge porte encore l'ancien nom — c'est
        // exactement ce qui écrasait la correction d'Alice auparavant.
        await expect(
            b.upsertNode({ ...vueB, roleTitre: 'Rôle corrigé par Bob' }, vueB.updatedAt),
        ).rejects.toBeInstanceOf(ConflitDeVersionError);

        // La correction d'Alice est intacte, et rien de Bob n'est passé.
        const finale = await a.get(id);
        expect(finale.nom).toBe('Nom corrigé par Alice');
        expect(finale.roleTitre).toBe('Rôle initial');
    });

    it('un jeton frais permet de réappliquer sa modification', async () => {
        // Le verrou détecte, il ne fusionne pas : le parcours attendu est
        // « recharger, puis réappliquer ». Il doit fonctionner sans friction.
        const id = randomUUID();
        const a = sessionA();
        const b = sessionB();
        await a.upsertNode(noeud(id));

        const vueA = await a.get(id);
        await a.upsertNode({ ...vueA, nom: 'Alice' }, vueA.updatedAt);

        const rechargee = await b.get(id); // Bob recharge
        await b.upsertNode({ ...rechargee, roleTitre: 'Bob' }, rechargee.updatedAt);

        const finale = await a.get(id);
        expect(finale.nom).toBe('Alice'); // conservé
        expect(finale.roleTitre).toBe('Bob'); // appliqué
    });

    it("l'écriture renvoie le NOUVEAU jeton, utilisable aussitôt", async () => {
        // Sans cela, un second enregistrement consécutif déclencherait un faux
        // conflit contre son propre écrit.
        const id = randomUUID();
        const a = sessionA();
        await a.upsertNode(noeud(id));

        const vue = await a.get(id);
        const apres = await a.upsertNode({ ...vue, nom: 'Premier' }, vue.updatedAt);
        expect(apres.updatedAt).toBeTruthy();
        expect(apres.updatedAt).not.toBe(vue.updatedAt);

        await expect(
            a.upsertNode({ ...apres, nom: 'Second' }, apres.updatedAt),
        ).resolves.toBeDefined();
        expect((await a.get(id)).nom).toBe('Second');
    });

    it('sans jeton attendu, le comportement historique est conservé', async () => {
        // Les écritures qui n'ont pas de jeton — création, import de masse —
        // ne doivent pas être bloquées. La garde est neutre quand le jeton est
        // absent, sinon l'import deviendrait impossible.
        const id = randomUUID();
        const a = sessionA();
        await a.upsertNode(noeud(id));
        const vue = await a.get(id);

        await expect(a.upsertNode({ ...vue, nom: 'Sans garde' })).resolves.toBeDefined();
        expect((await a.get(id)).nom).toBe('Sans garde');
    });

    it("un nœud supprimé entre-temps n'est pas ressuscité", async () => {
        // Avec un jeton, l'intention est « mettre à jour ce que j'ai chargé ».
        // Si la fiche a été supprimée depuis, la recréer en silence serait la
        // même perte silencieuse sous une autre forme. Et l'erreur doit être
        // distincte du conflit : « recharge » n'a aucun sens pour une fiche
        // disparue.
        const id = randomUUID();
        const a = sessionA();
        await a.upsertNode(noeud(id));
        const vue = await a.get(id);
        await a.deleteNode(id);

        await expect(a.upsertNode({ ...vue, nom: 'Zombie' }, vue.updatedAt)).rejects.toBeInstanceOf(
            NodeNotFoundError,
        );
        const [reste] = await sql`select id from public.hybrid_nodes where id = ${id}`;
        expect(reste).toBeUndefined();
    });
});
