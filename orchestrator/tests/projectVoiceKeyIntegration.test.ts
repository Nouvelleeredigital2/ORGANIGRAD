import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import Fastify from 'fastify';
import type {Sql} from 'postgres';
import {buildAuthHook} from '../src/api/auth.js';
import {registerProjectServiceDelegationRoutes} from '../src/api/projectServiceDelegations.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
it('mints an explicitly scoped voice key with real pgcrypto then authenticates its out-of-run checks',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 const app=Fastify();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create schema extensions;create extension pgcrypto with schema extensions;create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table workspace_members(workspace_id uuid,user_id uuid,role text);
   create function public.workspace_role_of(workspace uuid) returns text language sql security definer as $$select role from public.workspace_members where workspace_id=workspace and user_id=auth.uid()$$;
   create table projects(id uuid,workspace_id uuid,archived_at timestamptz,unique(id,workspace_id));
   create table workspace_api_keys(id uuid primary key default gen_random_uuid(),workspace_id uuid,name text,key_hash text,key_prefix text,created_by uuid,created_at timestamptz default now(),last_used_at timestamptz,scopes text[],expires_at timestamptz,revoked_at timestamptz);
   create table hybrid_nodes(id uuid primary key,workspace_id uuid,type text,nom text);
   create table bot_profiles(id uuid primary key,workspace_id uuid,enabled boolean);
   insert into projects values('${id(2)}','${id(1)}',null);
   insert into workspace_members values('${id(1)}','${id(1)}','owner');
   insert into hybrid_nodes values('${id(3)}','${id(1)}','AGENT_IA','Bot');
   insert into bot_profiles values('${id(3)}','${id(1)}',true);
   select set_config('request.jwt.claim.sub','${id(1)}',false);`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260914110000_project_service_delegations.sql',import.meta.url),'utf8'));
  await db.exec('set role authenticated');
  const created=(await db.query<{id:string;raw_key:string}>("select * from public.create_scoped_workspace_api_key($1,'Voix locale',array['voice:assign','voice:resolve'])",[id(1)])).rows[0]!;
  expect(created.raw_key.startsWith('ok_')).toBe(true);
  await expect(db.query("select * from public.create_scoped_workspace_api_key($1,'Interdit',array['human:approve'])",[id(1)])).rejects.toThrow('scope non technique');
  await db.exec('reset role');
  expect((await db.query<{scopes:string[]}>('select scopes from workspace_api_keys where id=$1',[created.id])).rows[0]!.scopes).toEqual(['voice:assign','voice:resolve']);
  const target={appId:'chat-vocal',workspaceId:'vox-a',resourceId:id(4)};
  await db.query("select public.project_service_delegation_command($1,$2,$1,null,'create',$3)",[id(1),id(2),JSON.stringify({grantId:id(5),apiKeyId:created.id,nodeId:id(3),target,actions:['voice:assign','voice:resolve'],expiresAt:new Date(Date.now()+60000).toISOString()})]);
  function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}):Sql {
   return Object.assign(async(strings:TemplateStringsArray,...values:unknown[])=>(await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows,{json:JSON.stringify,begin:(fn:(sql:Sql)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))}) as unknown as Sql;
  }
  const sql=adapter(db);app.addHook('onRequest',buildAuthHook({sql}));registerProjectServiceDelegationRoutes(app,sql,'https://org.example');
  for(const action of ['voice:assign','voice:resolve']){
   const result=await app.inject({method:'POST',url:`/api/projects/${id(2)}/service-delegations/check`,headers:{authorization:`Bearer ${created.raw_key}`},payload:{grantId:id(5),action,nodeId:id(3),target}});
   expect(result.statusCode).toBe(200);expect(result.json()).toMatchObject({action,nodeId:id(3),allowed:true});expect(result.json()).not.toHaveProperty('runId');expect(result.body.includes(created.raw_key)).toBe(false);
  }
  await db.query('update workspace_api_keys set revoked_at=now() where id=$1',[created.id]);
  expect((await app.inject({method:'POST',url:`/api/projects/${id(2)}/service-delegations/check`,headers:{authorization:`Bearer ${created.raw_key}`},payload:{grantId:id(5),action:'voice:resolve',nodeId:id(3),target}})).statusCode).toBe(401);
  await db.exec("update workspace_members set role='member';set role authenticated");
  await expect(db.query("select * from public.create_scoped_workspace_api_key($1,'Interdit',array['voice:assign'])",[id(1)])).rejects.toThrow('forbidden');
 }finally{await app.close();await db.close();}
},30000);
