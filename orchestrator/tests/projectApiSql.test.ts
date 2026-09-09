import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPgServer } from '../src/api/pgServer.js';

const A='21000000-0000-4000-8000-000000000001';
const B='21000000-0000-4000-8000-000000000002';
const U='11000000-0000-4000-8000-000000000001';
const X='11000000-0000-4000-8000-000000000002';
const P='31000000-0000-4000-8000-000000000001';
const db=new PGlite();

// Seul l'adaptateur du pilote postgres.js est remplacé. Toutes les requêtes
// Fastify, les jointures, filtres, agrégats et transactions passent au moteur SQL.
type QueryEngine={query: (sql:string, values?:unknown[])=>Promise<{rows:unknown[]}>};
function tag(engine:QueryEngine) {
    return async (strings:TemplateStringsArray, ...values:unknown[]) => {
        const sql=strings.reduce((text,part,i)=>text+(i ? `$${i}`:'')+part,'');
        return (await engine.query(sql,values)).rows;
    };
}
const sql=Object.assign(tag(db), {
    begin: async (options:string, fn:(tx:ReturnType<typeof tag>)=>Promise<unknown>) => db.transaction(async tx=> {
        if(options!=='isolation level repeatable read read only') throw new Error('Unexpected transaction');
        await tx.exec(`set transaction ${options}`);
        return fn(tag(tx));
    }),
}) as unknown as Sql;
const app=buildPgServer({sql,projectsEnabled:true,verifyUserToken:async token=>
    token==='TEST-OWNER' ? {sub:U} : token==='TEST-OTHER' ? {sub:X} : null});

beforeAll(async()=>{
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated;
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text,
        primary key(workspace_id,user_id));
      grant select on public.workspace_members to authenticated;
      insert into public.workspaces values ('${A}'),('${B}');
      insert into public.workspace_members values ('${A}','${U}','owner'),('${B}','${X}','admin');
    `);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260909090010_projects_and_tasks.sql',import.meta.url),'utf8'));
    await db.query('insert into public.projects(id,workspace_id,name) values ($1,$2,$3)',[P,A,'TEST-SYNAPSE-API']);
    for(const status of ['todo','running','blocked','done']) {
        await db.query('insert into public.project_tasks(workspace_id,project_id,title,status) values ($1,$2,$3,$4)',[A,P,`TEST-SYNAPSE-${status}`,status]);
    }
    await app.ready();
},30000);
afterAll(async()=>{await app.close();await db.close();});

function get(url:string,token='TEST-OWNER',workspace=A) {
    return app.inject({method:'GET',url,headers:{authorization:`Bearer ${token}`,'x-workspace-id':workspace}});
}

describe.sequential('projection API sur le SQL réel local',()=>{
    it('calcule les compteurs réels et les membres sans autre espace',async()=>{
        const result=await get(`/api/projects/${P}/context`);
        expect(result.statusCode).toBe(200);
        expect(result.json()).toMatchObject({project:{id:P,workspace_id:A,name:'TEST-SYNAPSE-API'},
            taskSummary:{total:4,done:1,running:1,blocked:1},workspaceMemberCount:1});
        expect(result.json().recentActivity).toHaveLength(4);
        expect(result.headers['cache-control']).toBe('private, no-store');
    });
    it('relit un changement de statut réel puis un archivage sans le compter',async()=>{
        await db.query("update public.project_tasks set status='done',version=2 where project_id=$1 and status='running'",[P]);
        expect((await get(`/api/projects/${P}/context`)).json().taskSummary).toEqual({total:4,done:2,running:0,blocked:1});
        await db.query("update public.project_tasks set archived_at=now(),version=2 where project_id=$1 and status='blocked'",[P]);
        expect((await get(`/api/projects/${P}/context`)).json().taskSummary).toEqual({total:3,done:2,running:0,blocked:0});
    });
    it('refuse l’autre compte et le projet hors espace',async()=>{
        expect((await get(`/api/projects/${P}/context`,'TEST-OTHER',A)).statusCode).toBe(403);
        expect((await get(`/api/projects/${P}/context`,'TEST-OTHER',B)).statusCode).toBe(404);
        expect((await get('/api/projects','TEST-OTHER',B)).json().projects).toHaveLength(0);
    });
    it('parcourt des pages sans perdre les microsecondes du curseur',async()=>{
        await db.query('insert into public.projects(workspace_id,name) values ($1,$2)',[A,'TEST-SYNAPSE-Page']);
        const first=await get('/api/projects?limit=1');
        expect(first.statusCode).toBe(200);
        expect(first.json().nextCursor).toBeTruthy();
        const second=await get(`/api/projects?limit=1&cursor=${first.json().nextCursor}`);
        expect(second.statusCode).toBe(200);
        expect(second.json().projects).toHaveLength(1);
        expect(second.json().projects[0].id).not.toBe(first.json().projects[0].id);
        expect(second.json().nextCursor).toBeUndefined();
    });
    it('limite l’activité à dix tâches réelles',async()=>{
        for(let i=0;i<12;i++) await db.query('insert into public.project_tasks(workspace_id,project_id,title) values ($1,$2,$3)',[A,P,`TEST-SYNAPSE-Borne-${i}`]);
        const result=(await get(`/api/projects/${P}/context`)).json();
        expect(result.recentActivity).toHaveLength(10);
        expect(result.taskSummary.total).toBe(15);
    });
    it('retire immédiatement la lecture à un membre sorti',async()=>{
        await db.query('delete from public.workspace_members where user_id=$1',[U]);
        expect((await get(`/api/projects/${P}/context`)).statusCode).toBe(403);
        expect((await get('/api/projects')).statusCode).toBe(403);
    });
});
