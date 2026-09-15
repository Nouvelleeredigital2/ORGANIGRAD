import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it} from 'vitest';
import Fastify from 'fastify';
import type {Sql} from 'postgres';
import {registerProjectServiceMissionRoutes} from '../src/api/projectServiceMissions.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite;
const call=(native='studio-a',resource='session-a',afterRun:string|null=null,afterGrant:string|null=null,limit=25)=>db.query<{result:{items:Array<{grantId:string;runId:string;runVersion:number;stepId:string;name:string}>;nextCursor:{runId:string;grantId:string}|null}}>('select public.list_project_service_missions($1,$2,$3,$4,$5,$6,$7,$8) as result',[id(1),id(3),'agentdetestux',native,resource,afterRun,afterGrant,limit]);
beforeEach(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table projects(id uuid,workspace_id uuid,name text,archived_at timestamptz);
 create table workspace_members(workspace_id uuid,user_id uuid,role text);
 create table workspace_api_keys(id uuid,workspace_id uuid,scopes text[],expires_at timestamptz,revoked_at timestamptz);
 create table hybrid_nodes(id uuid,workspace_id uuid,type text,nom text);
 create table project_service_delegations(id uuid,workspace_id uuid,project_id uuid,api_key_id uuid,node_id uuid,target jsonb,actions text[],granted_by uuid,expires_at timestamptz,revoked_at timestamptz);
 create table team_circuits(id uuid,workspace_id uuid,project_id uuid);
 create table circuit_executions(id uuid,workspace_id uuid,circuit_id uuid,version integer,state jsonb);
 insert into projects values('${id(2)}','${id(1)}','Projet A',null);
 insert into workspace_members values('${id(1)}','${id(4)}','owner');
 insert into workspace_api_keys values('${id(3)}','${id(1)}',array['node:run'],null,null);
 insert into hybrid_nodes values('${id(5)}','${id(1)}','AGENT_IA','Contrôleur');
 insert into project_service_delegations values('${id(6)}','${id(1)}','${id(2)}','${id(3)}','${id(5)}','{"appId":"agentdetestux","workspaceId":"studio-a","resourceId":"session-a"}',array['step:execute'],'${id(4)}',now()+interval '1 hour',null);
 insert into team_circuits values('${id(7)}','${id(1)}','${id(2)}');`);
 const state={version:3,status:'ready',currentStepId:'control',definition:{name:'Contrôle Boréal',project:{sourceApp:'organigrad',workspaceId:id(1),projectId:id(2)},steps:[{id:'control',kind:'control',assigneeId:id(5),instructions:'Private instructions should not leave catalogue'}]}};
 await db.query('insert into circuit_executions values($1,$2,$3,3,$4)',[id(8),id(1),id(7),JSON.stringify(state)]);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20260914160000_project_service_missions.sql',import.meta.url),'utf8'));
},30000);
afterEach(async()=>{await db.close();});
it('lists only the current assigned step for the exact native session',async()=>{
 const result=(await call()).rows[0]!.result;
 expect(result.items).toMatchObject([{grantId:id(6),runId:id(8),runVersion:3,stepId:'control',name:'Projet A'}]);
 expect(JSON.stringify(result)).not.toContain('Private instructions');
 expect((await call('studio-b')).rows[0]!.result.items).toEqual([]);
 expect((await call('studio-a','session-b')).rows[0]!.result.items).toEqual([]);
});
it.each([
 "update workspace_members set role='member'",
 "update workspace_api_keys set scopes=array['execution:read']",
 "update project_service_delegations set actions=array['execution:read']",
 "update project_service_delegations set revoked_at=now()",
 "update projects set archived_at=now()",
 "update circuit_executions set state=jsonb_set(state,'{status}','\"paused\"')",
 "update circuit_executions set version=4",
 `update circuit_executions set state=jsonb_set(state,'{definition,project,projectId}','"${id(22)}"')`,
 `update circuit_executions set state=jsonb_set(state,'{definition,steps,0,assigneeId}','"${id(23)}"')`,
 "update circuit_executions set state=jsonb_set(state,'{definition,steps,0,kind}','\"approval\"')",
 "update workspace_api_keys set expires_at=now()-interval '1 second'",
])('does not advertise unavailable authority or step: %s',async sql=>{
 await db.exec(sql);expect((await call()).rows[0]!.result.items).toEqual([]);
});
it('paginates by run and grant without mixing simultaneous dossiers',async()=>{
 await db.exec(`insert into circuit_executions select '${id(9)}',workspace_id,circuit_id,version,state from circuit_executions`);
 const first=(await call('studio-a','session-a',null,null,1)).rows[0]!.result;
 expect(first.items).toHaveLength(1);expect(first.nextCursor).toEqual({runId:id(8),grantId:id(6)});
 const second=(await call('studio-a','session-a',first.nextCursor!.runId,first.nextCursor!.grantId,1)).rows[0]!.result;
 expect(second.items[0]!.runId).toBe(id(9));expect(second.nextCursor).toBeNull();
});
it('rejects half a cursor and leaves public callers without EXECUTE',async()=>{
 await expect(call('studio-a','session-a',id(8))).rejects.toThrow('INVALID_MISSION_QUERY');
 expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.list_project_service_missions(uuid,uuid,text,text,text,uuid,uuid,integer)','EXECUTE') as allowed")).rows[0]!.allowed).toBe(false);
});
it('returns canonical references only to the native service identity',async()=>{
 function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}):Sql {
  return Object.assign(async(strings:TemplateStringsArray,...values:unknown[])=>(await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows,{begin:(fn:(sql:Sql)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))}) as unknown as Sql;
 }
 const app=Fastify();app.addHook('onRequest',async req=>{req.workspaceId=id(1);if(req.headers['x-human'])req.userId=id(4);else req.apiKeyId=id(3);});
 registerProjectServiceMissionRoutes(app,adapter(db),'https://organigrad.example');
 const url='/api/service-missions?appId=agentdetestux&workspaceId=studio-a&resourceId=session-a';
 try{
  const response=await app.inject({url});expect(response.statusCode).toBe(200);
  expect(response.json().items[0].project.canonicalUrl).toBe(`https://organigrad.example/?v=projects&project=${id(2)}&workspace=${id(1)}`);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect((await app.inject({url,headers:{'x-human':'yes'}})).statusCode).toBe(403);
  expect((await app.inject({url:url+'&apiKeyId='+id(9)})).statusCode).toBe(400);
  await db.exec(`update circuit_executions set state=jsonb_set(jsonb_set(state,'{currentStepId}','"vérifier la page"'),'{definition,steps,0,id}','"vérifier la page"')`);
  expect((await app.inject({url})).json().items[0].stepId).toBe('vérifier la page');
 }finally{await app.close();}
});
it('rejects an expired result before emitting mission names',async()=>{
 const app=Fastify();app.addHook('onRequest',async req=>{req.workspaceId=id(1);req.apiKeyId=id(3);});
 const sql={begin:async()=>{
  const rows=(await call()).rows;
  (rows[0]!.result.items[0] as unknown as {expiresAt:string}).expiresAt='2000-01-01T00:00:00Z';
  return rows;
 }} as unknown as Sql;
 registerProjectServiceMissionRoutes(app,sql,'https://organigrad.example');
 try{const response=await app.inject({url:'/api/service-missions?appId=agentdetestux&workspaceId=studio-a&resourceId=session-a'});expect(response.statusCode).toBe(503);expect(response.body).not.toContain('Projet A');}
 finally{await app.close();}
});
