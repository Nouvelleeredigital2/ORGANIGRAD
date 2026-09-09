import { PGlite } from '@electric-sql/pglite';
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPgServer, type PgServerDeps } from '../src/api/pgServer.js';
import { createSupabaseJwtVerifier } from '../src/api/userAuth.js';
import { loadEnv } from '../src/config/env.js';
import { privateProjectSession } from '../src/api/privateProjectSession.js';

const U='11000000-0000-4000-8000-000000000001', V='11000000-0000-4000-8000-000000000002';
const W='21000000-0000-4000-8000-000000000001', X='21000000-0000-4000-8000-000000000002';
const P='31000000-0000-4000-8000-000000000001', Q='31000000-0000-4000-8000-000000000002';
const S='41000000-0000-4000-8000-000000000001', T='41000000-0000-4000-8000-000000000002';
const issuer='https://auth-fixture.example/auth/v1', origin='https://ui-fixture.example';
const secret='synthetic-private-projects-signing-key';
const epoch=()=>Math.floor(Date.now()/1000);
const exp=epoch()+3600;
function jwt(changes:Record<string,unknown>={}, key=secret) {
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({iss:issuer,aud:'authenticated',role:'authenticated',
        is_anonymous:false,sub:U,session_id:S,exp,...changes})).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256',key).update(`${header}.${payload}`).digest('base64url')}`;
}
const db=new PGlite();
type Engine={query:(query:string,values?:unknown[])=>Promise<{rows:unknown[]}>};
function tag(engine:Engine) {
    return async(strings:TemplateStringsArray,...values:unknown[])=>(await engine.query(
        strings.reduce((query,part,i)=>query+(i?`$${i}`:'')+part,''),values)).rows;
}
const sql=Object.assign(tag(db),{
    begin:async(options:string,fn:(tx:ReturnType<typeof tag>)=>Promise<unknown>)=>db.transaction(async tx=>{
        if(!['isolation level repeatable read read only','isolation level repeatable read'].includes(options)) throw new Error('Unexpected transaction');
        await tx.exec(`set transaction ${options}`);
        await tx.exec('set local role service_role');
        return fn(tag(tx));
    }),
}) as unknown as Sql;
const config={sql,projectsEnabled:true,privateProjectsEnabled:true,privateProjectsIssuer:issuer,
    allowedOrigins:[origin],verifyUserToken:createSupabaseJwtVerifier({secret})};
// Extra properties intentionally accepted before the implementation exists: RED is HTTP behavior.
let app=buildPgServer(config as PgServerDeps);
const migration=new URL('../../supabase/migrations/20260909150000_private_project_tokens.sql',import.meta.url);

beforeAll(async()=>{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create table auth.users(id uuid primary key,is_anonymous boolean not null default false,banned_until timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,
        created_at timestamptz not null default now(),not_after timestamptz);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
      grant usage on schema public,auth to authenticated,anon,service_role;
      insert into auth.users(id) values ('${U}'),('${V}');
      insert into public.workspaces values ('${W}'),('${X}');`);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260909090010_projects_and_tasks.sql',import.meta.url),'utf8'));
    // Explicit qualified rights of this fixture, not a claim about production grants.
    await db.exec('grant select on auth.users,auth.sessions,public.workspace_members,public.projects,public.project_tasks to service_role');
    // Before implementation, leave the missing migration absent so failure is a behavioral assertion.
    if(existsSync(migration)) await db.exec(readFileSync(migration,'utf8'));
    await app.ready();
},30000);
beforeEach(async()=>{
    await app.close();app=buildPgServer(config as PgServerDeps);await app.ready();
    await db.exec(`delete from auth.sessions; delete from public.project_tasks; delete from public.projects;
      delete from public.workspace_members;
      update auth.users set is_anonymous=false,banned_until=null;
      insert into auth.sessions(id,user_id) values ('${S}','${U}'),('${T}','${V}');
      insert into public.workspace_members values ('${W}','${U}','viewer'),('${W}','${V}','owner'),('${X}','${V}','admin');
      insert into public.projects(id,workspace_id,name) values ('${P}','${W}','TEST-PERSONAL'),('${Q}','${X}','TEST-OTHER');
      insert into public.project_tasks(workspace_id,project_id,title,status) values ('${W}','${P}','Task','done');`);
});
afterAll(async()=>{await app.close();await db.close();});
function issue(token=jwt(), changes:Record<string,unknown>={}, headers:Record<string,string>={}) {
    return app.inject({method:'POST',url:'/api/private-projects/tokens',headers:{authorization:`Bearer ${token}`,
        'x-workspace-id':W,origin,...headers},payload:{projectId:P,name:'Synapse',expiresAt:exp,...changes}});
}
async function issued() {const res=await issue();expect(res.statusCode).toBe(201);return res.json();}
function read(path:string,token:string) {return app.inject({method:'GET',url:`/api/private-projects/${path}`,headers:{authorization:`Bearer ${token}`}});}
function list(token=jwt()) {return app.inject({method:'GET',url:`/api/private-projects/tokens?projectId=${P}`,
    headers:{authorization:`Bearer ${token}`,'x-workspace-id':W}});}
function revoke(id:string,token=jwt()) {return app.inject({method:'DELETE',url:`/api/private-projects/tokens/${id}`,
    headers:{authorization:`Bearer ${token}`,'x-workspace-id':W,origin}});}

describe.sequential('private projects: real SQL and signed sessions, no network',()=>{
    it('issues a bound, hashed credential and the exact introspection proof',async()=>{
        const result=await issued();
        expect(result.token).toMatch(/^ogp_[0-9a-f]{64}$/);
        const stored=(await db.query('select * from public.personal_project_tokens')).rows[0] as Record<string,unknown>;
        expect(stored).toMatchObject({owner_id:U,workspace_id:W,project_id:P,session_id:S,
            token_hash:createHash('sha256').update(result.token).digest('hex'),scopes:['projects:read']});
        expect(JSON.stringify(stored)).not.toContain(result.token);
        const proof=await read('introspect',result.token);
        expect(proof.statusCode).toBe(200);
        expect(proof.json()).toEqual({active:true,appId:'organigrad',subject:U,workspace:W,projectId:P,scopes:['projects:read'],expiresAt:exp});
        expect(proof.headers['cache-control']).toBe('private, no-store');
        const rows=await list();expect(rows.statusCode).toBe(200);
        expect(rows.body).not.toContain(result.token);expect(rows.body).not.toContain(stored.token_hash);
        expect(rows.json().tokens).toHaveLength(1);
    });
    it('returns exactly the existing context DTO, without a caller-selected project',async()=>{
        const {token}=await issued();const response=await read('context',token);
        const old=await app.inject({url:`/api/projects/${P}/context`,headers:{authorization:`Bearer ${jwt()}`,'x-workspace-id':W}});
        expect(response.statusCode).toBe(200);expect(response.json()).toEqual(old.json());
        expect(response.json()).toMatchObject({project:{id:P},taskSummary:{total:1,done:1},workspaceMemberCount:2});
        expect((await read(`context?projectId=${Q}`,token)).statusCode).toBe(400);
        expect((await read(`introspect?workspace=${X}`,token)).statusCode).toBe(400);
        expect((await app.inject({url:'/api/private-projects/context',headers:{authorization:`Bearer ${token}`,'x-workspace-id':X}})).statusCode).toBe(400);
    });
    it('caps lifetime to both the issuer JWT and live session not_after',async()=>{
        await db.query('update auth.sessions set not_after=to_timestamp($1) where id=$2',[exp-120,S]);
        const first=await issue(jwt(),{expiresAt:exp+500});expect(first.statusCode).toBe(201);
        expect((await read('introspect',first.json().token)).json().expiresAt).toBe(exp-120);
        await db.query('update auth.sessions set not_after=null where id=$1',[S]);
        const second=await issue(jwt({exp:exp-240}),{expiresAt:exp+500});expect(second.statusCode).toBe(201);
        expect((await read('introspect',second.json().token)).json().expiresAt).toBe(exp-240);
    });
    it.each([
        {iss:'https://other.example/auth/v1'},{aud:'service_role'},{aud:['authenticated']},{role:'service_role'},
        {is_anonymous:true},{is_anonymous:undefined},{session_id:undefined},{session_id:'bad'},
        {sub:'bad'},{exp:undefined},{exp:'9000000000'},{exp:1},{exp:1.5},{session_id:T},
    ])('rejects signed but invalid claims %j',async claims=>{
        expect((await issue(jwt(claims))).statusCode).toBe(401);
    });
    it('rejects bad signatures and never grants management to a personal or legacy token',async()=>{
        expect((await issue(jwt({},'wrong-key'))).statusCode).toBe(401);
        expect((await issue('ok_legacy')).statusCode).toBe(401);
        const {token}=await issued();expect((await issue(token)).statusCode).toBe(401);
        expect((await list(token)).statusCode).toBe(401);
        expect((await read('introspect',jwt())).statusCode).toBe(401);
        expect((await read('context','ok_legacy')).statusCode).toBe(401);
    });
    it('isolates the owner, workspace and project for management',async()=>{
        const {id}=await issued();const other=jwt({sub:V,session_id:T});
        expect((await list(other)).json().tokens).toEqual([]);
        expect((await revoke(id,other)).statusCode).toBe(404);
        expect((await issue(jwt(),{projectId:Q})).statusCode).toBe(403);
        expect((await issue(jwt(),{}, {'x-workspace-id':X})).statusCode).toBe(403);
        expect((await revoke(id)).statusCode).toBe(204);
    });
    it.each(['session','membership','project','ban','anonymous','session-expiry','token-expiry'])('revalidates %s before token use',async reason=>{
        const {token}=await issued();
        if(reason==='session') await db.query('delete from auth.sessions where id=$1',[S]);
        if(reason==='membership') await db.query('delete from public.workspace_members where user_id=$1',[U]);
        if(reason==='project') await db.query('delete from public.projects where id=$1',[P]);
        if(reason==='ban') await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[U]);
        if(reason==='anonymous') await db.query('update auth.users set is_anonymous=true where id=$1',[U]);
        if(reason==='session-expiry') await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[S]);
        if(reason==='token-expiry') {
            // Privileged corruption fixture bypasses only the immutability trigger.
            await db.exec('alter table public.personal_project_tokens disable trigger user');
            try {await db.query('update public.personal_project_tokens set expires_at=$1',[epoch()-1]);}
            finally {await db.exec('alter table public.personal_project_tokens enable trigger user');}
        }
        expect((await read('introspect',token)).statusCode).toBe(401);
        expect((await read('context',token)).statusCode).toBe(401);
    });
    it('requires a live session for issue, list and revoke',async()=>{
        const {id}=await issued();await db.query('delete from auth.sessions where id=$1',[S]);
        expect((await issue()).statusCode).toBe(401);
        expect((await list()).statusCode).toBe(401);
        expect((await revoke(id)).statusCode).toBe(401);
    });
    it('revokes with no secret disclosure and blocks every later use',async()=>{
        const {id,token}=await issued();expect((await revoke(id)).statusCode).toBe(204);
        expect((await revoke(id)).statusCode).toBe(204);
        expect((await read('introspect',token)).statusCode).toBe(401);
        expect((await read('context',token)).statusCode).toBe(401);
        expect((await app.inject({method:'HEAD',url:'/api/private-projects/context',headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(401);
    });
    it('enforces origin and strict, bounded request bodies',async()=>{
        expect((await issue(jwt(),{}, {origin:'https://evil.example'})).statusCode).toBe(403);
        expect((await issue(jwt(),{}, {origin:''})).statusCode).toBe(403);
        for(const changes of [{scopes:['projects:read','graph:read']},{ownerId:V},{sessionId:T},{name:'x'.repeat(81)},{expiresAt:0},{expiresAt:'tomorrow'},{projectId:null}]) {
            expect((await issue(jwt(),changes)).statusCode).toBe(400);
        }
        const large=await issue(jwt(),{name:'x'.repeat(5000)});expect(large.statusCode).toBe(413);
        expect(large.headers['cache-control']).toBe('private, no-store');expect(large.body).not.toContain('xxxxx');
    });
    it('cannot mutate projects or use graph, SSE, MCP or old project routes',async()=>{
        const {token}=await issued();
        for(const url of ['/api/graph','/api/projects',`/api/projects/${P}/context`,'/api/events/ticket','/mcp','/api/private-projects/context']) {
            const response=await app.inject({method:'POST',url,headers:{authorization:`Bearer ${token}`,'x-workspace-id':W,origin},payload:{}});
            expect(response.statusCode).toBeGreaterThanOrEqual(400);
        }
        expect((await app.inject({url:'/api/graph',headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(401);
    });
    it('database forbids changing project/session/owner/scope and hides credentials from browser roles',async()=>{
        const {id}=await issued();
        for(const assignment of [`project_id='${Q}'`,`owner_id='${V}'`,`session_id='${T}'`,"scopes=array['graph:read']","expires_at=expires_at+1"]) {
            await expect(db.exec(`update public.personal_project_tokens set ${assignment} where id='${id}'`)).rejects.toThrow();
        }
        for(const role of ['anon','authenticated']) {
            await expect(db.transaction(async tx=>{await tx.exec(`set local role ${role}`);return tx.exec('select * from public.personal_project_tokens');})).rejects.toThrow(/permission denied/);
        }
        await db.exec(readFileSync(migration,'utf8')); // migration is replayable
        expect(readFileSync(migration,'utf8')).toBe(readFileSync(new URL('../../supabase/schema/baseline_private_project_tokens_2026-09-09.sql',import.meta.url),'utf8'));
    });
    it('cannot insert a credential bound to another session owner or cross-workspace project',async()=>{
        const {id}=await issued();
        for(const [session,project] of [[T,P],[S,Q]]) {
            await expect(db.query(`insert into public.personal_project_tokens(owner_id,workspace_id,project_id,session_id,
              name,token_hash,token_prefix,issuer_expires_at,expires_at)
              select owner_id,workspace_id,$1,$2,name,repeat('a',64),token_prefix,issuer_expires_at,expires_at
              from public.personal_project_tokens where id=$3`,[project,session,id])).rejects.toThrow();
        }
        await expect(db.transaction(async tx=>{
            await tx.exec('set local role service_role');
            return tx.query('update public.personal_project_tokens set project_id=$1 where id=$2',[Q,id]);
        })).rejects.toThrow(/permission denied/);
    });

    it('reduces introspected expiry when not_after is shortened after issuance',async()=>{
        const {token}=await issued();await db.query('update auth.sessions set not_after=to_timestamp($1) where id=$2',[exp-600,S]);
        expect((await read('introspect',token)).json().expiresAt).toBe(exp-600);
    });
    it('blocks all management after membership removal and allows revoked metadata only to the owner',async()=>{
        const {id}=await issued();await revoke(id);
        expect((await list()).json().tokens[0].revokedAt).toEqual(expect.any(String));
        await db.query('delete from public.workspace_members where user_id=$1',[U]);
        expect((await issue()).statusCode).toBe(403);expect((await list()).statusCode).toBe(403);
        expect((await revoke(id)).statusCode).toBe(403);
    });
    it('does not expose underlying SQL failure text or credentials',async()=>{
        const {token}=await issued();
        const broken=Object.assign(tag(db),{begin:async()=>{throw new Error(`synthetic-private-db ${token}`);}}) as unknown as Sql;
        const failing=buildPgServer({...config,sql:broken});
        try {
            const res=await failing.inject({url:'/api/private-projects/context',headers:{authorization:`Bearer ${token}`}});
            expect(res.statusCode).toBe(503);expect(res.json()).toEqual({error:'PRIVATE_PROJECTS_UNAVAILABLE'});
            expect(res.headers['cache-control']).toBe('private, no-store');
        } finally {await failing.close();}
    });
    it('fails closed when auth.sessions is absent, without falling back to claims',async()=>{
        await db.exec('alter table auth.sessions rename to sessions_missing');
        try {expect((await issue()).statusCode).toBe(503);expect((await list()).statusCode).toBe(503);}
        finally {await db.exec('alter table auth.sessions_missing rename to sessions');}
    });
    it('bounds signature-verifier latency before any SQL or body disclosure',async()=>{
        let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
        let release!:()=>void;
        const verifier=async()=>{entered();return new Promise<null>(resolve=>{release=()=>resolve(null);});};
        try {
            vi.useFakeTimers();
            const response=privateProjectSession(jwt(),issuer,verifier).then(()=>200,error=>error.status);
            await started;await vi.advanceTimersByTimeAsync(5001);
            // Observe settlement without making the RED run wait forever.
            const settled=await Promise.race([response,Promise.resolve('pending')]);
            expect(settled).toBe(401);
        } finally {release?.();vi.useRealTimers();}
    });
    it('applies a finite request budget even to invalid anonymous tokens',async()=>{
        for(let i=0;i<600;i++) expect((await read('context','invalid')).statusCode).toBe(401);
        const denied=await read('context','invalid');expect(denied.statusCode).toBe(429);
        expect(denied.headers['retry-after']).toBe('60');
    });
});

it('keeps the private API disabled and requires explicit trusted configuration',async()=>{
    const disabled=buildPgServer({sql,verifyUserToken:config.verifyUserToken});
    try {
        for(const method of ['GET','POST'] as const) {
            const res=await disabled.inject({method,url:'/api/private-projects/introspect'});
            expect(res.statusCode).toBe(404);expect(res.headers['cache-control']).toBe('private, no-store');
        }
    } finally {await disabled.close();}
    expect(loadEnv({ORCHESTRATOR_ALLOW_MEMORY:'1'})).toHaveProperty('privateProjectsEnabled',false);
    expect(()=>loadEnv({ORCHESTRATOR_ALLOW_MEMORY:'1',PRIVATE_PROJECTS_ENABLED:'true'})).toThrow();
    expect(()=>loadEnv({SUPABASE_DB_URL:'postgres://test@localhost/test',SUPABASE_JWT_SECRET:secret,PRIVATE_PROJECTS_ENABLED:'true'})).toThrow();
});
