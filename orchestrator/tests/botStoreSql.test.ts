import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { expect, it } from 'vitest';
import { BotOptimisticConcurrencyError, PgBotStore, validateBotMutation } from '../src/state/pgBotStore.js';

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
        const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
            return (await db.query(query, values)).rows;
        };
        const sql = Object.assign(tag, { json: JSON.stringify }) as unknown as Sql;
        const store = new PgBotStore(sql, '00000000-0000-4000-8000-000000000010');
        const input = validateBotMutation({
            id: '00000000-0000-4000-8000-000000000011', runtimeId: 'hannah',
            fileName: 'Hannah.txt', displayName: 'Hannah', family: 'veilleur', mission: 'Initial mission',
        });
        const created = await store.upsert(input);
        await expect(store.upsert({ ...input, mission: 'Collision' })).rejects.toBeInstanceOf(BotOptimisticConcurrencyError);
        expect((await store.get(input.id)).mission).toBe('Initial mission');
        const updated = await store.upsert({ ...input, updated_at: created.updated_at, mission: 'Edited mission' });
        expect(updated.mission).toBe('Edited mission');
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
