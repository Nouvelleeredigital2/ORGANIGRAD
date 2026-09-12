import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps new SQL profiles draft, blocks unchecked activation and preserves already enabled profiles', async () => {
    const db = new PGlite();
    try {
        await db.exec("create table public.bot_profiles(id text primary key, enabled boolean not null default true, display_name text); insert into public.bot_profiles values ('legacy',true,'Legacy');");
        const migration = readFileSync(new URL('../../supabase/migrations/20260911162000_bot_draft_activation.sql', import.meta.url), 'utf8');
        expect(readFileSync(new URL('../../supabase/schema/baseline_bot_draft_activation_2026-09-11.sql', import.meta.url), 'utf8')).toBe(migration);
        await db.exec(migration);
        await db.exec(migration);
        await db.exec("insert into public.bot_profiles(id,enabled) values ('new',true); insert into public.bot_profiles(id) values ('default');");
        expect((await db.query("select enabled from public.bot_profiles where id in ('new','default')")).rows).toEqual([{ enabled: false }, { enabled: false }]);
        await expect(db.exec("update public.bot_profiles set enabled=true where id='new'")).rejects.toThrow('activation_requires_verification');
        await db.exec("update public.bot_profiles set display_name='Edited legacy' where id='legacy'");
        expect((await db.query("select enabled from public.bot_profiles where id='legacy'")).rows).toEqual([{ enabled: true }]);
        await db.exec("update public.bot_profiles set enabled=false where id='legacy'");
        await expect(db.exec("update public.bot_profiles set enabled=true where id='legacy'")).rejects.toThrow('activation_requires_verification');
    } finally { await db.close(); }
}, 30000);
