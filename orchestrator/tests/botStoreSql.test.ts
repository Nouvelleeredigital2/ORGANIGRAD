import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { expect, it } from 'vitest';
import { BotOptimisticConcurrencyError, PgBotStore, validateBotMutation } from '../src/state/pgBotStore.js';

it('keeps the portrait schema reference identical to its additive migration', () => {
    expect(readFileSync(new URL('../../supabase/schema/baseline_bot_portraits_2026-09-11.sql', import.meta.url), 'utf8'))
        .toBe(readFileSync(new URL('../../supabase/migrations/20260911143000_bot_portraits.sql', import.meta.url), 'utf8'));
});

it('prevents creation collisions, stale edits and resurrection after deletion in SQL', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated;
            create table public.workspaces(id uuid primary key);
            create function public.touch_updated_at() returns trigger language plpgsql as
                $$ begin new.updated_at = clock_timestamp(); return new; end $$;
            create function public.is_workspace_member(uuid) returns boolean language sql as $$ select true $$;
            create function public.has_workspace_role(uuid,text[]) returns boolean language sql as $$ select true $$;
            create function public.workspace_role_of(uuid) returns text language sql as $$ select 'owner'::text $$;
            insert into public.workspaces values ('00000000-0000-4000-8000-000000000010');
        `);
        await db.exec(readFileSync(new URL('../../supabase/migrations/20260911120000_bot_profiles.sql', import.meta.url), 'utf8'));
        await db.exec(readFileSync(new URL('../../supabase/migrations/20260911143000_bot_portraits.sql', import.meta.url), 'utf8'));
        await db.exec(readFileSync(new URL('../../supabase/migrations/20260911143000_bot_portraits.sql', import.meta.url), 'utf8'));
        const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
            return (await db.query(query, values)).rows;
        };
        const sql = Object.assign(tag, { json: JSON.stringify }) as unknown as Sql;
        const store = new PgBotStore(sql, '00000000-0000-4000-8000-000000000010');
        const input = validateBotMutation({
            id: '00000000-0000-4000-8000-000000000011', runtimeId: 'hannah',
            fileName: 'Hannah.txt', displayName: 'Hannah', family: 'veilleur', mission: 'Initial mission', enabled: true,
            avatarUrl: 'https://images.example.org/hannah.png',
        });
        const created = await store.upsert(input);
        expect(created.avatarUrl).toBe(input.avatarUrl);
        await expect(store.upsert({ ...input, mission: 'Collision' })).rejects.toBeInstanceOf(BotOptimisticConcurrencyError);
        expect((await store.get(input.id)).mission).toBe('Initial mission');
        const updated = await store.upsert({ ...input, updated_at: created.updated_at, mission: 'Edited mission' });
        expect(updated.mission).toBe('Edited mission');
        const legacyInput = { ...input };
        delete legacyInput.avatarUrl;
        const legacyUpdated = await store.upsert({ ...legacyInput, updated_at: updated.updated_at });
        expect(legacyUpdated.avatarUrl).toBe(input.avatarUrl);
        const cleared = await store.upsert({ ...input, avatarUrl: null, updated_at: legacyUpdated.updated_at, mission: 'Edited mission' });
        expect(cleared.avatarUrl).toBeNull();
        await expect(store.upsert({ ...input, updated_at: created.updated_at, mission: 'Stale edit' }))
            .rejects.toBeInstanceOf(BotOptimisticConcurrencyError);
        await db.query('update public.bot_profiles set compiled_prompt=$1,compiled_sha256=$2 where id=$3', ['forged', 'a'.repeat(64), input.id]);
        const bundle = await store.bundle();
        expect(bundle.files['Hannah.txt']?.content).toContain('Edited mission');
        expect(bundle.files['Hannah.txt']?.content).not.toBe('forged');
        await store.remove(input.id);
        await expect(store.upsert({ ...input, updated_at: updated.updated_at }))
            .rejects.toBeInstanceOf(BotOptimisticConcurrencyError);
        expect(await store.list()).toEqual([]);
    } finally {
        await db.close();
    }
}, 30000);

it('updates only owned node identity atomically and preserves externally managed nodes', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated;
            create table public.workspaces(id uuid primary key);
            create function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
            create function public.is_workspace_member(uuid) returns boolean language sql as $$ select true $$;
            create function public.has_workspace_role(uuid,text[]) returns boolean language sql as $$ select true $$;
            create function public.workspace_role_of(uuid) returns text language sql as $$ select 'owner'::text $$;
            insert into public.workspaces values ('00000000-0000-4000-8000-000000000010');
            create table public.hybrid_nodes(id uuid primary key, workspace_id uuid, type text, nom text check(nom <> 'Rejected identity'), role_titre text,
                parent_id uuid, grade_id text, skills text[], status text, external_app text, avatar_url text,
                system_prompt text, mcp_config jsonb, notification_channels jsonb);
        `);
        for (const file of ['20260911120000_bot_profiles.sql', '20260911143000_bot_portraits.sql']) {
            await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
        }
        const makeSql = (connection: Pick<PGlite, 'query'>): Sql => {
            const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => {
                const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
                return (await connection.query(query, values)).rows;
            };
            return Object.assign(tag, { json: JSON.stringify, array: (v: unknown) => v,
                begin: (fn: (sql: Sql) => unknown) => db.transaction(tx => Promise.resolve(fn(makeSql(tx)))) }) as unknown as Sql;
        };
        const workspace = '00000000-0000-4000-8000-000000000010';
        const store = new PgBotStore(makeSql(db), workspace);
        const input = validateBotMutation({ id: '00000000-0000-4000-8000-000000000011', runtimeId: 'hannah', fileName: 'Hannah.txt', displayName: 'Hannah', family: 'veilleur', mission: 'Veille', avatarUrl: 'https://images.example.org/h.png' });
        let profile = await store.createWithNode(input);
        expect(profile.enabled).toBe(false);
        await expect(store.updateWithNode({ ...input, updated_at: profile.updated_at, enabled: true })).rejects.toThrow('vérification');
        expect((await store.get(input.id)).enabled).toBe(false);
        await db.query(`update public.hybrid_nodes set parent_id=$1,grade_id='Lead',skills=array['custom'],status='RUNNING',system_prompt='Keep prompt',mcp_config='{"mode":"keep"}',notification_channels='{"email":true}'`, [workspace]);
        const readNode = async () => (await db.query<Record<string, unknown>>('select * from public.hybrid_nodes')).rows[0];
        const before = await readNode();
        let mise = await store.updateWithNode({ ...input, updated_at: profile.updated_at, displayName: 'Hannah 4', brand: 'Nature', avatarUrl: 'https://images.example.org/new.png' });
        profile = mise.bot;
        // Nœud possédé par Organigrad : il suit la fiche, et le dit.
        expect(mise.nodeSync).toEqual({ synchronized: true });
        expect(await readNode()).toEqual({ ...before, nom: 'Hannah 4', role_titre: 'veilleur · Nature', avatar_url: 'https://images.example.org/new.png' });
        const beforeFailure = await store.get(input.id);
        await expect(store.updateWithNode({ ...input, updated_at: profile.updated_at, displayName: 'Rejected identity' })).rejects.toThrow();
        expect(await store.get(input.id)).toEqual(beforeFailure);
        // Nœud qu'Organigrad ne possède pas : il n'est pas réécrit — et la
        // désynchronisation est SIGNALÉE au lieu d'être tue. Le premier cas est
        // celui des 14 bots migrés, dont les nœuds portent `external_app = 'link'`.
        for (const ownership of [
            { workspace, type: 'AGENT_IA', owner: 'link', attendu: 'link' },
            { workspace: '00000000-0000-4000-8000-000000000012', type: 'AGENT_IA', owner: 'organigrad-bots', attendu: undefined },
            { workspace, type: 'HUMAIN', owner: 'organigrad-bots', attendu: undefined },
        ]) {
            await db.query('update public.hybrid_nodes set workspace_id=$1,type=$2,external_app=$3', [ownership.workspace, ownership.type, ownership.owner]);
            const externalBefore = await readNode();
            mise = await store.updateWithNode({ ...input, updated_at: profile.updated_at, displayName: 'New identity' });
            profile = mise.bot;
            expect(await readNode()).toEqual(externalBefore);
            expect(mise.nodeSync.synchronized).toBe(false);
            expect(mise.nodeSync.ownedBy).toBe(ownership.attendu);
            // La fiche, elle, appartient bien à Organigrad et reste modifiable.
            expect(profile.displayName).toBe('New identity');
        }
    } finally { await db.close(); }
}, 30000);

it('creates bot and node atomically, preserving a compatible node and rolling back foreign or human collisions', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon; create role authenticated;
            create table public.workspaces(id uuid primary key);
            create function public.touch_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;
            create function public.is_workspace_member(uuid) returns boolean language sql as $$ select true $$;
            create function public.has_workspace_role(uuid,text[]) returns boolean language sql as $$ select true $$;
            create function public.workspace_role_of(uuid) returns text language sql as $$ select 'owner'::text $$;
            insert into public.workspaces values ('00000000-0000-4000-8000-000000000010');
            create table public.hybrid_nodes(id uuid primary key, workspace_id uuid, type text, nom text, role_titre text,
                parent_id uuid, grade_id text, skills text[], status text, external_app text, avatar_url text);
        `);
        for (const file of ['20260911120000_bot_profiles.sql', '20260911143000_bot_portraits.sql']) {
            await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
        }
        const makeSql = (connection: Pick<PGlite, 'query'>): Sql => {
            const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => {
                const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
                return (await connection.query(query, values)).rows;
            };
            return Object.assign(tag, { json: JSON.stringify, array: (v: unknown) => v,
                begin: (fn: (sql: Sql) => unknown) => db.transaction(tx => Promise.resolve(fn(makeSql(tx)))) }) as unknown as Sql;
        };
        const workspace = '00000000-0000-4000-8000-000000000010';
        const store = new PgBotStore(makeSql(db), workspace);
        const input = validateBotMutation({ id: '00000000-0000-4000-8000-000000000011', runtimeId: 'hannah', fileName: 'Hannah.txt', displayName: 'Hannah', family: 'veilleur', mission: 'Veille', avatarUrl: 'https://images.example.org/h.png' });
        const created = await store.createWithNode({ ...input, enabled: true });
        expect(created.enabled).toBe(false);
        expect((await db.query('select nom, avatar_url from public.hybrid_nodes')).rows).toEqual([{ nom: 'Hannah', avatar_url: input.avatarUrl }]);
        await store.remove(input.id);
        await db.query('update public.hybrid_nodes set nom=$1 where id=$2', ['Existing name', input.id]);
        await store.createWithNode(input);
        expect((await db.query('select nom from public.hybrid_nodes')).rows).toEqual([{ nom: 'Existing name' }]);
        for (const [nodeWorkspace, type] of [[workspace, 'HUMAIN'], ['00000000-0000-4000-8000-000000000012', 'AGENT_IA']]) {
            await store.remove(input.id);
            await db.query('update public.hybrid_nodes set workspace_id=$1,type=$2 where id=$3', [nodeWorkspace, type, input.id]);
            await expect(store.createWithNode(input)).rejects.toThrow();
            expect(await store.list()).toEqual([]);
        }
    } finally { await db.close(); }
}, 30000);
