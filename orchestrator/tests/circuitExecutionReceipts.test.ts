import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

// Reçus persistants de production (candidat 20260915120000, non appliqué).
const root = new URL('../..', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260915120000_circuit_execution_receipts.sql', root), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const workspace = '00000000-0000-4000-8000-000000000001';
const run = '00000000-0000-4000-8000-000000000002';
const otherRun = '00000000-0000-4000-8000-000000000003';
const mandate = '00000000-0000-4000-8000-000000000004';
const revokedMandate = '00000000-0000-4000-8000-000000000005';
const project = { sourceApp: 'organigrad', workspaceId: workspace, projectId: 'p', canonicalUrl: 'https://organigrad.example/p' };
const reference = (kind: string, id = randomUUID()) => ({ sourceApp: 'atelier-orvion', id, kind, version: 1, canonicalUrl: 'https://orvion.example/boards/b/view/editorial' });

async function setup() {
    const db = new PGlite();
    await db.exec(`
        create role anon; create role authenticated; create role service_role;
        alter default privileges in schema public grant all on tables to service_role;
        create table public.circuit_executions (id uuid primary key, workspace_id uuid not null, unique (id, workspace_id));
        create table public.project_service_delegations (id uuid primary key, workspace_id uuid not null, expires_at timestamptz not null, revoked_at timestamptz);
        insert into public.circuit_executions values ('${run}','${workspace}'), ('${otherRun}','${workspace}');
        insert into public.project_service_delegations values ('${mandate}','${workspace}', now() + interval '1 day', null), ('${revokedMandate}','${workspace}', now() + interval '1 day', now());
    `);
    await db.exec(migration);
    const call = async (fn: string, args: unknown[]) =>
        (await db.query<{ r: Record<string, any> }>(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0]!.r;
    return {
        db,
        reserve: (key: string, payloadSha: string, opts: { run?: string; step?: string; mandate?: string | null; version?: number } = {}) =>
            call('circuit_receipt_reserve', [workspace, opts.run ?? run, opts.version ?? 1, opts.step ?? 'step-1', JSON.stringify(project), key, payloadSha, opts.mandate === undefined ? mandate : opts.mandate]),
        accept: (id: string, ref: object) => call('circuit_receipt_accept', [id, JSON.stringify(ref)]),
        uncertain: (id: string) => call('circuit_receipt_mark_uncertain', [id]),
        supersede: (id: string, by: string) => call('circuit_receipt_supersede', [id, by]),
    };
}

it('reserves before the external call, replays identically, refuses a different fingerprint under the same key', async () => {
    const { db, reserve, accept } = await setup();
    try {
        const key = randomUUID();
        const reserved = await reserve(key, sha('payload-1'));
        expect(reserved).toMatchObject({ status: 'reserved', workspace_id: workspace, run_id: run, step_id: 'step-1', mandate_id: mandate, reference: null });
        expect((await reserve(key, sha('payload-1'))).id).toBe(reserved.id);
        await expect(reserve(key, sha('payload-2'))).rejects.toThrow('IDEMPOTENCY_CONFLICT');
        await expect(reserve(randomUUID(), sha('x'), { run: randomUUID() })).rejects.toThrow('RUN_UNAVAILABLE');
        await expect(reserve(randomUUID(), sha('x'), { mandate: revokedMandate })).rejects.toThrow('MANDATE_UNAVAILABLE');
        await expect(reserve(randomUUID(), sha('x'), { mandate: randomUUID() })).rejects.toThrow('MANDATE_UNAVAILABLE');
        await expect(reserve(randomUUID(), 'not-a-digest')).rejects.toThrow('INVALID_RECEIPT');
        expect((await reserve(randomUUID(), sha('x'), { mandate: null })).mandate_id).toBeNull();
        // Accepté seulement avec une référence complète ; jamais de contenu.
        await expect(accept(reserved.id, { sourceApp: 'atelier-orvion', id: 'a' })).rejects.toThrow('INVALID_REFERENCE');
        await expect(accept(reserved.id, { ...reference('article'), canonicalUrl: 'http://insecure' })).rejects.toThrow('INVALID_REFERENCE');
        const ref = reference('article');
        const accepted = await accept(reserved.id, ref);
        expect(accepted).toMatchObject({ status: 'accepted', reference: ref });
        expect(accepted.accepted_at).not.toBeNull();
        expect((await accept(reserved.id, ref)).id).toBe(reserved.id);
        await expect(accept(reserved.id, reference('article'))).rejects.toThrow('RECEIPT_CONFLICT');
        // Après acceptation, la même clé rend le reçu accepté : aucune seconde écriture.
        expect((await reserve(key, sha('payload-1'))).status).toBe('accepted');
        await expect(accept(randomUUID(), ref)).rejects.toThrow('RECEIPT_UNAVAILABLE');
    } finally { await db.close(); }
});

it('a lost answer stays uncertain and blocks a second write under the same key', async () => {
    const { db, reserve, accept, uncertain } = await setup();
    try {
        const key = randomUUID();
        const reserved = await reserve(key, sha('p'));
        const marked = await uncertain(reserved.id);
        expect(marked.status).toBe('uncertain');
        expect((await uncertain(reserved.id)).status).toBe('uncertain');
        await expect(reserve(key, sha('p'))).rejects.toThrow('RECEIPT_UNCERTAIN');
        // Un reçu incertain ne redevient jamais accepté par la voie normale : la résolution est humaine.
        const accepted = await reserve(randomUUID(), sha('q'));
        await accept(accepted.id, reference('brief'));
        await expect(uncertain(accepted.id)).rejects.toThrow('RECEIPT_ALREADY_SETTLED');
    } finally { await db.close(); }
});

it('a correction supersedes only an accepted control receipt of the same run and keeps its old reference', async () => {
    const { db, reserve, accept, supersede } = await setup();
    try {
        const article = await accept((await reserve(randomUUID(), sha('a'), { step: 'write' })).id, reference('article'));
        const review = await accept((await reserve(randomUUID(), sha('r'), { step: 'control' })).id, reference('review'));
        const articleV2 = await accept((await reserve(randomUUID(), sha('a2'), { step: 'write', version: 2 })).id, { ...reference('article'), version: 2 });
        await expect(supersede(article.id, articleV2.id)).rejects.toThrow('RECEIPT_NOT_CONTROL');
        await expect(supersede(review.id, review.id)).rejects.toThrow('INVALID_RECEIPT');
        const pending = await reserve(randomUUID(), sha('r2'), { step: 'control', version: 2 });
        await expect(supersede(review.id, pending.id)).rejects.toThrow('SUCCESSOR_UNAVAILABLE');
        const foreign = await accept((await reserve(randomUUID(), sha('f'), { run: otherRun })).id, reference('review'));
        await expect(supersede(review.id, foreign.id)).rejects.toThrow('SUCCESSOR_UNAVAILABLE');
        const reviewV2 = await accept(pending.id, { ...reference('review'), version: 2 });
        const superseded = await supersede(review.id, reviewV2.id);
        expect(superseded).toMatchObject({ status: 'superseded', superseded_by: reviewV2.id, reference: review.reference });
        expect((await supersede(review.id, reviewV2.id)).status).toBe('superseded');
        await expect(supersede(review.id, articleV2.id)).rejects.toThrow('RECEIPT_CONFLICT');
        const rows = await db.query<{ status: string }>('select status from public.circuit_execution_receipts where id=$1', [article.id]);
        expect(rows.rows[0]!.status).toBe('accepted');
    } finally { await db.close(); }
});

it('keeps the receipts table unreachable directly and the RPCs reserved to service_role', async () => {
    const { db } = await setup();
    try {
        for (const role of ['service_role', 'authenticated', 'anon'])
            for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
                expect((await db.query<{ ok: boolean }>('select has_table_privilege($1,$2,$3) as ok', [role, 'public.circuit_execution_receipts', privilege])).rows[0]!.ok).toBe(false);
        for (const fn of ['circuit_receipt_reserve(uuid,uuid,integer,text,jsonb,uuid,text,uuid)', 'circuit_receipt_accept(uuid,jsonb)', 'circuit_receipt_mark_uncertain(uuid)', 'circuit_receipt_supersede(uuid,uuid)'])
            for (const [role, ok] of [['service_role', true], ['authenticated', false], ['anon', false]] as const)
                expect((await db.query<{ ok: boolean }>(`select has_function_privilege($1,$2,'EXECUTE') as ok`, [role, 'public.' + fn])).rows[0]!.ok).toBe(ok);
        const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='circuit_execution_receipts'");
        expect(columns.rows.map(r => r.column_name)).not.toEqual(expect.arrayContaining(['content', 'prompt', 'jwt', 'engine_key']));
    } finally { await db.close(); }
});

it('re-executes on a fresh database', async () => {
    const { db } = await setup();
    try {
        expect((await db.query<{ n: number }>("select count(*)::int as n from pg_proc where proname like 'circuit_receipt_%'")).rows[0]!.n).toBe(4);
    } finally { await db.close(); }
});
