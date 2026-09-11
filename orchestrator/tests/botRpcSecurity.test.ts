import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('scoped bot key SQL authorization', () => {
    it('keeps the additive schema reference identical to the migration', () => {
        expect(readFileSync(new URL('../../supabase/schema/baseline_bot_profiles_2026-09-11.sql', import.meta.url), 'utf8'))
            .toBe(readFileSync(new URL('../../supabase/migrations/20260911120000_bot_profiles.sql', import.meta.url), 'utf8'));
    });
    it('rejects NULL and member roles using the actual migration function', async () => {
        const db = new PGlite();
        try {
            await db.exec(`
                create schema extensions;
                create function public.workspace_role_of(uuid) returns text language sql as
                    $$ select nullif(current_setting('test.workspace_role', true), '') $$;
            `);
            const migration = readFileSync(new URL('../../supabase/migrations/20260911120000_bot_profiles.sql', import.meta.url), 'utf8');
            const start = migration.indexOf('create or replace function public.create_scoped_workspace_api_key');
            const end = migration.indexOf('$function$;', start) + '$function$;'.length;
            expect(start).toBeGreaterThan(0);
            await db.exec(migration.slice(start, end));
            for (const role of ['', 'member', 'viewer']) {
                await db.query("select set_config('test.workspace_role', $1, false)", [role]);
                await expect(db.query("select * from public.create_scoped_workspace_api_key('00000000-0000-4000-8000-000000000001', 'test', array['bots:export'])"))
                    .rejects.toThrow('forbidden');
            }
        } finally {
            await db.close();
        }
    });
});
