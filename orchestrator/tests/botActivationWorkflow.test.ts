import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const root = new URL('../..', import.meta.url);
const migration = readFileSync(new URL('supabase/migrations/20260914170000_bot_activation_workflow.sql', root), 'utf8');
const draftGuard = readFileSync(new URL('supabase/migrations/20260911162000_bot_draft_activation.sql', root), 'utf8');

const workspaceId = '00000000-0000-4000-8000-000000000001';
const ownerId = '00000000-0000-4000-8000-000000000002';
const memberId = '00000000-0000-4000-8000-000000000003';
const botId = '00000000-0000-4000-8000-000000000004';

async function setup() {
    const db = new PGlite();
    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$
            select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        create table public.bot_profiles (
            id uuid primary key, workspace_id uuid not null, runtime_id text not null,
            file_name text not null, display_name text not null, family text not null,
            mission text not null default '', sources jsonb not null default '[]',
            model jsonb not null default '{}', enabled boolean not null default true,
            compiled_prompt text not null default '', compiled_sha256 text not null default ''
        );
        create table public.workspace_members (
            workspace_id uuid not null, user_id uuid not null, role text not null,
            primary key (workspace_id, user_id)
        );
        insert into public.workspace_members values
          ('${workspaceId}', '${ownerId}', 'owner'),
          ('${workspaceId}', '${memberId}', 'member');
    `);
    await db.exec(draftGuard);
    await db.exec(migration);
    await db.exec(`select set_config('request.jwt.claim.sub', '${ownerId}', false)`);
    return db;
}

async function insertReadyBot(db: PGlite, id = botId) {
    await db.exec(`
        insert into public.bot_profiles
          (id, workspace_id, runtime_id, file_name, display_name, family, mission, sources, model, enabled, compiled_prompt, compiled_sha256)
        values
          ('${id}', '${workspaceId}', 'hannah', 'Hannah.txt', 'Hannah', 'veilleur',
           'Produire une veille sourcée.', '[{"label":"Source officielle","url":"https://example.org"}]',
           '{"provider":"ollama","model":"gpt-oss"}', false, 'prompt compilé', '${'a'.repeat(64)}');
    `);
}

it('activates a verified bot only through the owner command and records the receipt', async () => {
    const db = await setup();
    try {
        await insertReadyBot(db);
        await expect(db.exec(`update public.bot_profiles set enabled=true where id='${botId}'`))
            .rejects.toThrow('activation_requires_verification');

        const result = await db.query(`select public.activate_verified_bot('${botId}'::uuid) as result`);
        expect((result.rows[0] as { result: unknown }).result).toMatchObject({ status: 'activated', botId, actorId: ownerId });
        expect((await db.query(`select enabled from public.bot_profiles where id='${botId}'`)).rows).toEqual([{ enabled: true }]);
        expect((await db.query(`select action, compiled_sha256 from public.bot_activation_receipts where bot_id='${botId}'`)).rows)
            .toEqual([{ action: 'activated', compiled_sha256: 'a'.repeat(64) }]);
    } finally { await db.close(); }
});

it('refuses activation when a mandatory verification is missing and lets an owner revoke an active bot', async () => {
    const db = await setup();
    try {
        await insertReadyBot(db);
        await db.exec(`update public.bot_profiles set mission='' where id='${botId}'`);
        await expect(db.exec(`select public.activate_verified_bot('${botId}'::uuid)`)).rejects.toThrow('ACTIVATION_CHECK_FAILED');

        await db.exec(`update public.bot_profiles set mission='Mission complète' where id='${botId}'`);
        await db.exec(`select public.activate_verified_bot('${botId}'::uuid)`);
        const result = await db.query(`select public.deactivate_bot('${botId}'::uuid, 'Révision demandée') as result`);
        expect((result.rows[0] as { result: unknown }).result).toMatchObject({ status: 'draft', botId, actorId: ownerId });
        expect((await db.query(`select enabled from public.bot_profiles where id='${botId}'`)).rows).toEqual([{ enabled: false }]);
        expect((await db.query(`select action, reason from public.bot_activation_receipts order by created_at desc limit 1`)).rows)
            .toEqual([{ action: 'deactivated', reason: 'Révision demandée' }]);
    } finally { await db.close(); }
});

it('refuses a member who attempts to activate a bot', async () => {
    const db = await setup();
    try {
        await insertReadyBot(db);
        await db.exec(`select set_config('request.jwt.claim.sub', '${memberId}', false)`);
        await expect(db.exec(`select public.activate_verified_bot('${botId}'::uuid)`)).rejects.toThrow('ADMIN_REQUIRED');
    } finally { await db.close(); }
});
