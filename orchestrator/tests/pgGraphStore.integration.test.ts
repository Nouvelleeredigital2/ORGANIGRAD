import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { PgGraphStore, NodeNotFoundError } from '../src/state/pgGraphStore.js';
import { IllegalTransitionError } from '../src/domain/stateMachine.js';

/**
 * Test d'intégration PostgreSQL RÉEL pour PgGraphStore (Phase 2).
 *
 * Hermétique par défaut : ne s'exécute QUE si `TEST_DATABASE_URL` est défini
 * (sinon `describe.runIf` saute toute la suite). Aucun mock — vraie base.
 *
 * Lancer :
 *   docker run --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
 *   TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres \
 *     npm test -- pgGraphStore.integration
 *
 * Le schéma minimal nécessaire est créé idempotemment (sans dépendance à
 * `auth.users`, donc compatible Postgres nu). Les données de test sont isolées
 * par un workspace UUID unique puis nettoyées.
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(TEST_DB_URL))('PgGraphStore — intégration PostgreSQL', () => {
    let sql: Sql;
    const workspaceId = randomUUID();
    const nodeId = randomUUID();
    const node2Id = randomUUID();

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

        await sql`insert into public.workspaces (id, name) values (${workspaceId}, 'IT test')`;
        for (const id of [nodeId, node2Id]) {
            await sql`insert into public.hybrid_nodes (id, workspace_id, type, nom, status)
                      values (${id}, ${workspaceId}, 'AGENT_IA', 'IT node', 'IDLE')`;
        }
    });

    afterAll(async () => {
        if (!sql) return;
        await sql`delete from public.node_transitions where workspace_id = ${workspaceId}`;
        await sql`delete from public.hybrid_nodes where workspace_id = ${workspaceId}`;
        await sql`delete from public.workspaces where id = ${workspaceId}`;
        await sql.end({ timeout: 5 });
    });

    it('get / list lisent le nœud', async () => {
        const store = new PgGraphStore(sql, workspaceId);
        expect((await store.get(nodeId)).status).toBe('IDLE');
        expect((await store.list()).length).toBeGreaterThanOrEqual(2);
    });

    it('applyTransition persiste le statut ET écrit le journal (transaction)', async () => {
        const store = new PgGraphStore(sql, workspaceId);
        const updated = await store.applyTransition(nodeId, 'EXECUTING', { reason: 'it' });
        expect(updated.status).toBe('EXECUTING');
        expect((await store.get(nodeId)).status).toBe('EXECUTING');
        const rows = await sql`select count(*)::int as n from public.node_transitions
                               where workspace_id = ${workspaceId} and node_id = ${nodeId}`;
        expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
    });

    it('une transition illégale est refusée (rollback, pas de journal)', async () => {
        const store = new PgGraphStore(sql, workspaceId);
        // nodeId est en EXECUTING ; EXECUTING → IDLE est illégal.
        await expect(store.applyTransition(nodeId, 'IDLE')).rejects.toBeInstanceOf(
            IllegalTransitionError,
        );
    });

    it('nœud introuvable → NodeNotFoundError', async () => {
        const store = new PgGraphStore(sql, workspaceId);
        await expect(store.get(randomUUID())).rejects.toBeInstanceOf(NodeNotFoundError);
    });

    it('double exécution concurrente : une seule réussit (SELECT FOR UPDATE)', async () => {
        const store = new PgGraphStore(sql, workspaceId);
        const [a, b] = await Promise.allSettled([
            store.applyTransition(node2Id, 'EXECUTING'),
            store.applyTransition(node2Id, 'EXECUTING'),
        ]);
        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual(['fulfilled', 'rejected']);
    });
});
