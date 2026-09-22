import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const U = '10000000-0000-4000-8000-000000000001';
const V = '10000000-0000-4000-8000-000000000002';
const X = '10000000-0000-4000-8000-000000000003';
const A = '20000000-0000-4000-8000-000000000001';
const B = '20000000-0000-4000-8000-000000000002';
const P = '30000000-0000-4000-8000-000000000001';
const T = '40000000-0000-4000-8000-000000000001';
const db = new PGlite();
const migration = readFileSync(new URL('../../supabase/migrations/20260909090010_projects_and_tasks.sql', import.meta.url), 'utf8');

// PostgreSQL réel embarqué, identités synthétiques uniquement, aucun Supabase distant.
beforeAll(async () => {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated;
      create table public.workspaces(id uuid primary key);
      -- Contrat de lecture de schema/baseline_2026-08-03.sql : enum réel,
      -- helper definer non récursif et policy « wm read members ».
      create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
      create table public.workspace_members(
        workspace_id uuid references public.workspaces(id), user_id uuid,
        role public.workspace_role not null default 'member'::public.workspace_role,
        primary key(workspace_id,user_id));
      create function public.is_workspace_member(ws uuid)
      returns boolean language sql stable security definer set search_path to 'public'
      as $$
        select exists(
          select 1 from public.workspace_members
          where workspace_id = ws and user_id = auth.uid()
        );
      $$;
      create function public.workspace_role_of(ws uuid)
      returns public.workspace_role language sql stable security definer set search_path to 'public'
      as $$
        select role from public.workspace_members
        where workspace_id = ws and user_id = auth.uid();
      $$;
      -- Exerce les GRANT authenticated requis par les helpers RLS existants.
      revoke execute on function public.is_workspace_member(uuid), public.workspace_role_of(uuid) from public, anon;
      grant execute on function public.is_workspace_member(uuid), public.workspace_role_of(uuid) to authenticated;
      alter table public.workspace_members enable row level security;
      create policy "wm read members" on public.workspace_members for select
        using (public.is_workspace_member(workspace_id));
      grant select on public.workspace_members to authenticated;
      insert into public.workspaces values ('${A}'),('${B}');
      insert into public.workspace_members values ('${A}','${U}','owner'),
        ('${A}','${V}','viewer'),('${B}','${X}','admin');
    `);
    await db.exec(migration);
}, 30000);
afterAll(async () => { await db.close(); });

async function as(user: string, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
        return tx.query(sql, params);
    });
}

describe.sequential('projets : migration, RLS et persistance réelle', () => {
    it('crée les deux tables persistantes attendues', async () => {
        const result = await db.query("select tablename from pg_tables where schemaname='public' and tablename in ('projects','project_tasks')");
        expect(result.rows).toHaveLength(2);
    });
    it('persiste un projet et une tâche, sans données préremplies', async () => {
        expect((await as(U, 'select * from public.projects')).rows).toHaveLength(0);
        await as(U, 'insert into public.projects(id,workspace_id,name) values ($1,$2,$3)', [P,A,'TEST-SYNAPSE-Projet']);
        await as(U, 'insert into public.project_tasks(id,workspace_id,project_id,title,assignee_id) values ($1,$2,$3,$4,$5)', [T,A,P,'TEST-SYNAPSE-Tâche',U]);
        expect((await as(U, 'select title,status,version from public.project_tasks')).rows).toEqual([{title:'TEST-SYNAPSE-Tâche',status:'todo',version:1}]);
    });
    it('autorise le viewer à lire, refuse un administrateur d’un autre espace', async () => {
        expect((await as(V,'select user_id from public.workspace_members where workspace_id=$1 order by user_id',[A])).rows).toEqual([{user_id:U},{user_id:V}]);
        expect((await as(X,'select user_id from public.workspace_members where workspace_id=$1',[A])).rows).toHaveLength(0);
        expect((await as(V,'select id from public.projects')).rows).toHaveLength(1);
        expect((await as(X,'select id from public.projects')).rows).toHaveLength(0);
        expect((await as(X,'select id from public.project_tasks')).rows).toHaveLength(0);
    });
    it('refuse une création par viewer et une insertion dans un autre espace', async () => {
        await expect(as(V,'insert into public.projects(workspace_id,name) values ($1,$2)',[A,'Interdit'])).rejects.toThrow(/row-level security/);
        await expect(as(U,'insert into public.projects(workspace_id,name) values ($1,$2)',[B,'Interdit'])).rejects.toThrow(/row-level security/);
    });
    it('ne modifie rien pour un viewer', async () => {
        expect((await as(V,'update public.projects set name=$1 where id=$2 returning id',['Interdit',P])).rows).toHaveLength(0);
        expect((await as(V,'update public.project_tasks set title=$1 where id=$2 returning id',['Interdit',T])).rows).toHaveLength(0);
    });
    it('refuse une tâche dans un projet d’un autre espace', async () => {
        await expect(as(X,'insert into public.project_tasks(workspace_id,project_id,title) values ($1,$2,$3)',[B,P,'Interdit'])).rejects.toThrow();
    });
    it.each(['', ' '.repeat(2), 'x'.repeat(161)])('refuse un nom de projet invalide %#', async (name) => {
        await expect(as(U,'insert into public.projects(workspace_id,name) values ($1,$2)',[A,name])).rejects.toThrow(/check constraint/);
    });
    it.each(['', ' ', 'x'.repeat(201)])('refuse un titre de tâche invalide %#', async (title) => {
        await expect(as(U,'insert into public.project_tasks(workspace_id,project_id,title) values ($1,$2,$3)',[A,P,title])).rejects.toThrow(/check constraint/);
    });
    it('refuse un état inventé et une date impossible', async () => {
        await expect(as(U,"update public.project_tasks set status='IDLE',version=2 where id=$1",[T])).rejects.toThrow(/check constraint/);
        await expect(as(U,"update public.project_tasks set due_date='2026-02-31',version=2 where id=$1",[T])).rejects.toThrow();
    });
    it('refuse l’affectation à un membre extérieur', async () => {
        await expect(as(U,'update public.project_tasks set assignee_id=$1,version=2 where id=$2',[X,T])).rejects.toThrow(/ASSIGNEE_NOT_MEMBER/);
    });
    it('interdit le déplacement des identifiants, espaces et dates de création', async () => {
        await expect(as(U,'update public.projects set workspace_id=$1 where id=$2',[B,P])).rejects.toThrow();
        await expect(as(U,"update public.projects set created_at=created_at-interval '1 day' where id=$1",[P])).rejects.toThrow(/IMMUTABLE/);
        await expect(as(U,'update public.project_tasks set project_id=$1 where id=$2',['30000000-0000-4000-8000-000000000099',T])).rejects.toThrow(/IMMUTABLE/);
    });
    it('protège les modifications concurrentes par version et relit l’écriture', async () => {
        expect((await as(U,"update public.project_tasks set status='running',due_date='2026-09-30',version=2 where id=$1 and version=1 returning version",[T])).rows).toEqual([{version:2}]);
        expect((await as(U,"update public.project_tasks set status='done',version=2 where id=$1 and version=1 returning id",[T])).rows).toHaveLength(0);
        await expect(as(U,"update public.project_tasks set status='done',version=2 where id=$1",[T])).rejects.toThrow(/VERSION_CONFLICT/);
        expect((await as(U,'select status,due_date::text from public.project_tasks where id=$1',[T])).rows).toEqual([{status:'running',due_date:'2026-09-30'}]);
    });
    it('refuse une mutation directe sans version attendue explicite', async () => {
        await expect(as(U,'update public.projects set name=$1 where id=$2',['Écrasement',P])).rejects.toThrow(/VERSION/);
        await expect(as(U,'update public.project_tasks set title=$1 where id=$2',['Écrasement',T])).rejects.toThrow(/VERSION/);
    });
    it('un double envoi du même identifiant ne crée pas deux tâches', async () => {
        await expect(as(U,'insert into public.project_tasks(id,workspace_id,project_id,title) values ($1,$2,$3,$4)',[T,A,P,'Doublon'])).rejects.toThrow(/duplicate key/);
        expect((await as(U,'select id from public.project_tasks')).rows).toHaveLength(1);
    });
    it('archive un projet, verrouille ses tâches, puis permet la restauration', async () => {
        await as(U,'update public.projects set archived_at=now(),version=2 where id=$1',[P]);
        await expect(as(U,"update public.project_tasks set status='done',version=3 where id=$1",[T])).rejects.toThrow(/PROJECT_ARCHIVED/);
        await expect(as(U,'insert into public.project_tasks(workspace_id,project_id,title) values ($1,$2,$3)',[A,P,'Nouvelle'])).rejects.toThrow(/PROJECT_ARCHIVED/);
        await as(U,'update public.projects set archived_at=null,version=3 where id=$1',[P]);
        await as(U,"update public.project_tasks set status='done',version=3 where id=$1",[T]);
    });
    it('archive et restaure la tâche sans la supprimer', async () => {
        await as(U,'update public.project_tasks set archived_at=now(),version=4 where id=$1',[T]);
        expect((await as(U,'select id from public.project_tasks where archived_at is null')).rows).toHaveLength(0);
        await as(U,'update public.project_tasks set archived_at=null,version=5 where id=$1',[T]);
        expect((await as(U,'select id from public.project_tasks where archived_at is null')).rows).toHaveLength(1);
    });
    it('ne permet pas une suppression physique via la session', async () => {
        await expect(as(U,'delete from public.project_tasks where id=$1',[T])).rejects.toThrow(/permission denied/);
        await expect(as(U,'delete from public.projects where id=$1',[P])).rejects.toThrow(/permission denied/);
    });
    it('borne la longueur brute du nom, espaces compris', async () => {
        const name = 'x' + ' '.repeat(160);
        await expect(as(U,'insert into public.projects(workspace_id,name) values ($1,$2)',[A,name])).rejects.toThrow(/check constraint/);
        await expect(as(U,'update public.projects set name=$1,version=4 where id=$2',[name,P])).rejects.toThrow(/check constraint/);
    });
    it('borne la longueur brute du titre, espaces compris', async () => {
        const title = 'x' + ' '.repeat(200);
        await expect(as(U,'insert into public.project_tasks(workspace_id,project_id,title) values ($1,$2,$3)',[A,P,title])).rejects.toThrow(/check constraint/);
        await expect(as(U,'update public.project_tasks set title=$1,version=6 where id=$2',[title,T])).rejects.toThrow(/check constraint/);
    });
    it('accepte les longueurs brutes maximales de nom et titre', async () => {
        const name = 'x' + ' '.repeat(159);
        const title = 'x' + ' '.repeat(199);
        expect((await as(U,'insert into public.projects(workspace_id,name) values ($1,$2) returning name',[A,name])).rows).toEqual([{name}]);
        expect((await as(U,'insert into public.project_tasks(workspace_id,project_id,title) values ($1,$2,$3) returning title',[A,P,title])).rows).toEqual([{title}]);
    });
    it.each(['infinity', '-infinity', '10000-01-01', '0001-12-31 BC'])('refuse une échéance hors plage UI : %s', async (dueDate) => {
        await expect(as(U,'insert into public.project_tasks(workspace_id,project_id,title,due_date) values ($1,$2,$3,$4)',[A,P,'Borne date',dueDate])).rejects.toThrow(/check constraint/);
        await expect(as(U,'update public.project_tasks set due_date=$1,version=6 where id=$2',[dueDate,T])).rejects.toThrow(/check constraint/);
    });
    it.each([null, '0001-01-01', '9999-12-31'])('accepte une échéance nullable ou aux bornes UI : %s', async (dueDate) => {
        expect((await as(U,'insert into public.project_tasks(workspace_id,project_id,title,due_date) values ($1,$2,$3,$4) returning due_date::text',[A,P,'Borne date',dueDate])).rows).toEqual([{due_date:dueDate}]);
    });
    it('réévalue le rôle modifié et l’appartenance retirée', async () => {
        // Limite : db.query agit comme propriétaire de la base, hors RLS.
        // Ce retrait prouve l'absence de FK bloquante et la révocation des accès,
        // pas les droits de retrait owner/admin ni la protection du owner réel.
        // Les policies de mutation de workspace_members ne sont pas reproduites ici.
        await db.query("update public.workspace_members set role='viewer' where user_id=$1",[U]);
        expect((await as(U,"update public.project_tasks set status='todo' where id=$1 returning id",[T])).rows).toHaveLength(0);
        await db.query('delete from public.workspace_members where user_id=$1',[U]);
        expect((await as(U,'select id from public.projects')).rows).toHaveLength(0);
        // L'ancien responsable ne bloque pas le retrait du membre.
        await db.query("update public.workspace_members set role='member' where user_id=$1",[V]);
        await as(V,'update public.project_tasks set assignee_id=null,version=6 where id=$1',[T]);
        await expect(as(V,'update public.project_tasks set assignee_id=$1,version=7 where id=$2',[U,T])).rejects.toThrow(/ASSIGNEE_NOT_MEMBER/);
    });
    it('ne donne aucun accès anonyme ni fonction de mutation publique privilégiée', async () => {
        await expect(db.transaction(async tx => {await tx.exec('set local role anon'); return tx.exec('select * from public.projects');})).rejects.toThrow(/permission denied/);
        const guards = await db.query("select prosecdef from pg_proc where proname in ('guard_project_mutation','guard_project_task_mutation')");
        expect(guards.rows).toEqual([{prosecdef:false},{prosecdef:false}]);
    });
});
