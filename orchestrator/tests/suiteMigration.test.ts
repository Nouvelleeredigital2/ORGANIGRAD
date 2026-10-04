import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/20261004120000_synapse_suite_projects.sql', import.meta.url), 'utf8');

describe('migration projets Synapse', () => {
    it('garde le baseline documentaire identique à la migration livrée', () => {
        expect(readFileSync(new URL('../../supabase/schema/baseline_synapse_suite_projects_2026-10-04.sql', import.meta.url), 'utf8')).toBe(migration);
    });
    it('est rejouable, privée et conserve les lignes existantes', async () => {
        const db = new PGlite();
        try {
            await db.exec(`
                create role anon; create role authenticated;
                create schema auth; create table auth.users(id uuid primary key);
                create table public.workspaces(id uuid primary key);
                create table public.projects(id uuid primary key, workspace_id uuid not null references public.workspaces(id), name text not null, description text not null default '', unique(workspace_id,id));
                create table public.workspace_members(workspace_id uuid not null, user_id uuid not null references auth.users(id), role text not null, primary key(workspace_id,user_id));
                insert into public.workspaces values ('22222222-2222-4222-8222-222222222222');
                insert into auth.users values ('33333333-3333-4333-8333-333333333333');
                insert into public.workspace_members values ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','owner');
                insert into public.projects(id,workspace_id,name) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Existant');
            `);
            await db.exec(migration); await db.exec(migration);
            const projects = await db.query<{ count: number }>('select count(*)::int as count from public.projects');
            expect(projects.rows[0]?.count).toBe(1);
            const tables = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('synapse_project_links','synapse_project_grants') order by relname");
            expect(tables.rows).toEqual([{ relrowsecurity: true }, { relrowsecurity: true }]);
        } finally { await db.close(); }
    });
});
