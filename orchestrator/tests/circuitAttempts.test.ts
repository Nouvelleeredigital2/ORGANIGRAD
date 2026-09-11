import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { expect, it } from 'vitest';
import { PgCircuitAttempts } from '../src/state/pgCircuitAttempts.js';

const workspace = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const key = { runId, runVersion: 1, stepId: 'image' };
const input = { ...key, payloadSha256: 'a'.repeat(64) };

it('accepte un identifiant d’étape de 128 caractères conformément au contrat', async () => {
    const { db, store } = await fixture();
    try {
        const stepId='s'.repeat(128);
        await db.query('update public.circuit_executions set state=$1', [JSON.stringify({ version:1,status:'ready',currentStepId:stepId })]);
        expect((await store.reserve({...input,stepId})).receipt.stepId).toBe(stepId);
    } finally { await db.close(); }
},30000);

async function fixture() {
    const db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create table public.circuit_executions(id uuid primary key,workspace_id uuid,version integer,state jsonb);`);
    await db.query('insert into public.circuit_executions values($1,$2,1,$3)', [runId, workspace, JSON.stringify({ id: runId, version: 1, status: 'ready', currentStepId: 'image' })]);
    const migration = readFileSync(new URL('../../supabase/migrations/20260911165000_circuit_attempts.sql', import.meta.url), 'utf8');
    expect(readFileSync(new URL('../../supabase/schema/baseline_circuit_attempts_2026-09-11.sql', import.meta.url), 'utf8')).toBe(migration);
    await db.exec(migration); await db.exec(migration);
    function adapter(connection: Pick<PGlite, 'query'>): Sql {
        const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => (await connection.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values)).rows;
        return Object.assign(tag, { json: JSON.stringify, begin: (fn: (sql: Sql) => unknown) => db.transaction(tx => Promise.resolve(fn(adapter(tx)))) }) as unknown as Sql;
    }
    const sql = adapter(db);
    return { db, store: new PgCircuitAttempts(sql, workspace), sql };
}

it('reserves only a ready current step, fences expired reservations and rejects divergent retries', async () => {
    const { db, store, sql } = await fixture();
    try {
        const first = await store.reserve(input);
        expect(first.receipt.status).toBe('reserved');
        await expect(store.reserve(input)).rejects.toThrow('ATTEMPT_BUSY');
        await expect(store.reserve({ ...input, payloadSha256: 'b'.repeat(64) })).rejects.toThrow('ATTEMPT_PAYLOAD_CONFLICT');
        await expect(new PgCircuitAttempts(sql, jobId).getReceipt(key)).rejects.toThrow('ATTEMPT_NOT_FOUND');
        await db.exec("update public.circuit_step_attempts set lease_until=clock_timestamp()-interval '1 second'");
        const second = await store.reserve(input);
        expect(second.fencingToken).not.toBe(first.fencingToken);
        await expect(store.markDispatched({ ...key, fencingToken: first.fencingToken })).rejects.toThrow('STALE_ATTEMPT');
        await db.query('update public.circuit_executions set state=$1', [JSON.stringify({ version: 1, status: 'paused', currentStepId: 'image' })]);
        await expect(store.markDispatched({ ...key, fencingToken: second.fencingToken })).rejects.toThrow('STEP_NOT_READY');
        await expect(store.reserve(input)).rejects.toThrow('STEP_NOT_READY');
    } finally { await db.close(); }
}, 30000);

it('persists dispatch before delivery, never resubmits after crash, and accepts the real receipt during pause', async () => {
    const { db, store, sql } = await fixture();
    try {
        const reserved = await store.reserve(input);
        const owned = { ...key, fencingToken: reserved.fencingToken };
        expect((await store.markDispatched(owned)).status).toBe('dispatched');
        await expect(store.markDispatched(owned)).rejects.toThrow('ATTEMPT_ALREADY_DISPATCHED');
        await db.exec("update public.circuit_step_attempts set lease_until=clock_timestamp()-interval '1 second'");
        const restarted = new PgCircuitAttempts(sql, workspace);
        expect((await restarted.recoverExpired(key)).status).toBe('uncertain');
        await expect(restarted.reserve(input)).rejects.toThrow('DELIVERY_UNCERTAIN');
        const paused = { version: 2, status: 'paused', currentStepId: 'image' };
        await db.query('update public.circuit_executions set version=2,state=$1', [JSON.stringify(paused)]);
        expect((await restarted.recordAcceptedJob(owned, jobId)).status).toBe('accepted');
        expect((await restarted.recordAcceptedJob(owned, jobId)).jobId).toBe(jobId);
        await expect(restarted.recordAcceptedJob(owned, runId)).rejects.toThrow('JOB_RECEIPT_CONFLICT');
        expect((await db.query<{ state: unknown }>('select state from public.circuit_executions')).rows[0]?.state).toEqual(paused);
        expect(await restarted.getReceipt(key)).toMatchObject({ jobId, payloadSha256: input.payloadSha256 });
        await db.exec('set role authenticated');
        await expect(db.query('select * from public.circuit_step_attempts')).rejects.toThrow();
        await db.exec('reset role');
    } finally { await db.close(); }
}, 30000);

it('blocks a new execution version from replacing an unresolved delivery of the same step', async () => {
    const { db, store } = await fixture();
    try {
        const first = await store.reserve(input);
        await store.markDispatched({ ...key, fencingToken: first.fencingToken });
        await db.query('update public.circuit_executions set version=3,state=$1', [JSON.stringify({ version: 3, status: 'ready', currentStepId: 'image' })]);
        await expect(store.reserve({ ...input, runVersion: 3 })).rejects.toThrow('PREVIOUS_DELIVERY_UNRESOLVED');
        await store.recordAcceptedJob({ ...key, fencingToken: first.fencingToken }, jobId);
        await expect(store.reserve({ ...input, runVersion: 3 })).rejects.toThrow('PREVIOUS_DELIVERY_UNRESOLVED');
        expect((await db.query('select * from public.circuit_step_attempts')).rows).toHaveLength(1);
        await db.query('update public.circuit_executions set version=5,state=$1', [JSON.stringify({ version: 5, status: 'ready', currentStepId: 'image', history: [{ stepId: 'image', version: 3, kind: 'completed' }, { stepId: 'approval', version: 4, kind: 'revised' }] })]);
        expect((await store.reserve({ ...input, runVersion: 5, payloadSha256: 'b'.repeat(64) })).receipt.status).toBe('reserved');
    } finally { await db.close(); }
}, 30000);
