import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';

function removeOwnedFixture(parent: string, directory: string) {
    const resolved = realpathSync(directory);
    if (dirname(resolved) !== parent || !basename(resolved).startsWith('organigrad-projects-test-')) {
        throw new Error('Répertoire temporaire inattendu : nettoyage refusé');
    }
    rmSync(resolved, {recursive:true});
}

it('retrouve un projet et une tâche après fermeture et réouverture du stockage local', async () => {
    const parent = realpathSync(tmpdir());
    const directory = mkdtempSync(join(parent, 'organigrad-projects-test-'));
    let db: PGlite | undefined;
    try {
        db = new PGlite(directory);
        await db.exec(`
          create role anon; create role authenticated; create schema auth;
          create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
          create table public.workspaces(id uuid primary key);
          create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
          insert into public.workspaces values ('22000000-0000-4000-8000-000000000001');
        `);
        await db.exec(readFileSync(new URL('../../supabase/migrations/20260909090010_projects_and_tasks.sql',import.meta.url),'utf8'));
        await db.exec(`
          insert into public.projects(id,workspace_id,name)
            values ('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','TEST-SYNAPSE-Persisté');
          insert into public.project_tasks(workspace_id,project_id,title)
            values ('22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','TEST-SYNAPSE-À retrouver');
          update public.project_tasks set status='done',version=2;
        `);
        await db.close();
        db = new PGlite(directory);
        expect((await db.query('select name from public.projects')).rows).toEqual([{name:'TEST-SYNAPSE-Persisté'}]);
        expect((await db.query('select title,status,version from public.project_tasks')).rows).toEqual([{title:'TEST-SYNAPSE-À retrouver',status:'done',version:2}]);
    } finally {
        await db?.close();
        // Nettoyage limité au répertoire créé par CE test. Ni racine ni glob.
        removeOwnedFixture(parent, directory);
    }
},30000);
