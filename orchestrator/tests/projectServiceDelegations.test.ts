import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Sql } from 'postgres';
import { registerProjectServiceDelegationRoutes } from '../src/api/projectServiceDelegations.js';
import { loadEnv } from '../src/config/env.js';
const ws='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333',node='44444444-4444-4444-8444-444444444444',grant='55555555-5555-4555-8555-555555555555',run='66666666-6666-4666-8666-666666666666';
let db:PGlite;
const target={appId:'ned-media-engine',workspaceId:'native-client-a',resourceId:'generate-image'};
const checked=()=>({grantId:grant,target,action:'step:execute',runId:run,runVersion:1,stepId:'image'});
const creation=()=>({grantId:grant,apiKeyId:key,nodeId:node,target,actions:['execution:read','step:execute'],expiresAt:new Date(Date.now()+3600000).toISOString()});
async function call(command:string,input:unknown={},user:string|null=ws,apiKey:string|null=null,projectId=project){
 return (await db.query<{result:Record<string,unknown>}>('select public.project_service_delegation_command($1,$2,$3,$4,$5,$6) as result',[ws,projectId,user,apiKey,command,JSON.stringify(input)])).rows[0]!.result;
}
beforeEach(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table projects(id uuid,workspace_id uuid,archived_at timestamptz,unique(id,workspace_id));
 create table workspace_members(workspace_id uuid,user_id uuid,role text);
 create table workspace_api_keys(id uuid primary key,workspace_id uuid,name text,key_hash text,scopes text[],expires_at timestamptz,revoked_at timestamptz);
 create table hybrid_nodes(id uuid primary key,workspace_id uuid,type text,nom text);
 create table bot_profiles(id uuid primary key,workspace_id uuid,enabled boolean);
 create table team_circuits(id uuid,workspace_id uuid,project_id uuid);
 create table circuit_executions(id uuid,workspace_id uuid,circuit_id uuid,version integer,state jsonb);
 insert into projects values('${project}','${ws}',null);
 insert into workspace_members values('${ws}','${ws}','owner');
 insert into workspace_api_keys values('${key}','${ws}','Engine','secret-hash',array['node:run','execution:read'],null,null);
 insert into hybrid_nodes values('${node}','${ws}','SOFTWARE_MCP','Engine');
 insert into team_circuits values('${run}','${ws}','${project}');`);
 await db.query('insert into circuit_executions values($1,$2,$1,1,$3)',[run,ws,JSON.stringify({version:1,status:'ready',currentStepId:'image',definition:{project:{projectId:project,workspaceId:ws,sourceApp:'organigrad',canonicalUrl:'https://organigrad.example/?v=projects&project='+project+'&workspace='+ws},steps:[{id:'image',kind:'generation',assigneeId:node}]}})]);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20260914110000_project_service_delegations.sql',import.meta.url),'utf8'));
},30000);
afterEach(async()=>{await db.close();});

it('persists once, returns secret-free options and checks the exact native target/run',async()=>{
 const input=creation();await call('create',input);await call('create',input);
 const list=await call('list');expect(JSON.stringify(list)).not.toContain('secret-hash');expect((list.grants as unknown[])).toHaveLength(1);
 const result=await call('check',checked(),null,key);
 expect(result).toMatchObject({allowed:true,projectId:project,workspaceId:ws,target,runId:run,runVersion:1,stepId:'image',recheckBeforeEffect:true});
 expect(Date.parse(String(result.expiresAt))-Date.parse(String(result.checkedAt))).toBeLessThanOrEqual(5000);
 expect((await db.query('select * from project_service_delegation_audit')).rows).toHaveLength(2);
});
it('reads an advanced run without asserting an old execution version; execute remains CAS',async()=>{
 await call('create',creation());
 const read={grantId:grant,target,action:'execution:read',runId:run};
 await db.exec(`update circuit_executions set version=2,state=jsonb_set(jsonb_set(state,'{version}','2'),'{status}','"ready_to_publish"')`);
 const result=await call('check',read,null,key);
 expect(result).toMatchObject({action:'execution:read',runId:run,currentRunVersion:2});
 expect(result).not.toHaveProperty('runVersion');expect(result).not.toHaveProperty('stepId');expect(result).not.toHaveProperty('state');
 await expect(call('check',checked(),null,key)).rejects.toThrow('STALE_EXECUTION');
 await expect(call('check',{...read,runVersion:1},null,key)).rejects.toThrow('INVALID_INPUT');
 await db.exec("update circuit_executions set version=3");await expect(call('check',read,null,key)).rejects.toThrow('STALE_EXECUTION');
});
it('can authorize historical reading with a distinct read-only grant without authorizing execution',async()=>{
 await call('create',{...creation(),actions:['execution:read']});
 const read={grantId:grant,target,action:'execution:read',runId:run};
 expect(await call('check',read,null,key)).toMatchObject({currentRunVersion:1});
 await expect(call('check',checked(),null,key)).rejects.toThrow('ACTION_FORBIDDEN');
 await db.exec("update workspace_api_keys set scopes=array['node:run']");await expect(call('check',read,null,key)).rejects.toThrow('KEY_SCOPE_REQUIRED');
});
it('refuses duplicate mutation, NULL CAS, stale revocation and resurrection; retry revoke stays idempotent',async()=>{
 const input=creation();await call('create',input);
 await expect(call('create',{...input,target:{...target,resourceId:'other'}})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 await expect(call('revoke',{grantId:grant,expectedVersion:null})).rejects.toThrow('VERSION_REQUIRED');
 await expect(call('revoke',{grantId:grant,expectedVersion:5})).rejects.toThrow('STALE_GRANT');
 await call('revoke',{grantId:grant,expectedVersion:1});await call('revoke',{grantId:grant,expectedVersion:1});
 await expect(call('check',checked(),null,key)).rejects.toThrow('GRANT_UNAVAILABLE');
 await expect(call('create',input)).rejects.toThrow('GRANT_REVOKED');
 expect((await db.query("select * from project_service_delegation_audit where kind='revoked'")).rows).toHaveLength(1);
});
it('requires human admin and active scoped key, without promoting schedule:create',async()=>{
 await expect(call('create',creation(),null,key)).rejects.toThrow('HUMAN_SESSION_REQUIRED');
 await db.exec("update workspace_members set role='member'");await expect(call('create',creation())).rejects.toThrow('ADMIN_REQUIRED');
 await db.exec("update workspace_members set role='owner';update workspace_api_keys set scopes=array['schedule:create']");
 await expect(call('create',creation())).rejects.toThrow('KEY_SCOPE_REQUIRED');
 await expect(call('create',{...creation(),actions:['schedule:create']})).rejects.toThrow('INVALID_ACTION');
});
it('rejects revoked grantor, archived project, withdrawn key scopes and foreign node',async()=>{
 await call('create',creation());await db.exec("update workspace_members set role='member'");
 await expect(call('check',checked(),null,key)).rejects.toThrow('GRANTOR_REVOKED');
 await db.exec("update workspace_members set role='owner';update projects set archived_at=now()");
 await expect(call('check',checked(),null,key)).rejects.toThrow('PROJECT_UNAVAILABLE');
 // Archive must not prevent revocation by an admin.
 await call('revoke',{grantId:grant,expectedVersion:1});
 await db.exec("update projects set archived_at=null;update project_service_delegations set revoked_at=null;update workspace_api_keys set scopes=array['execution:read']");
 await expect(call('check',checked(),null,key)).rejects.toThrow('KEY_SCOPE_REQUIRED');
 await db.exec(`update workspace_api_keys set scopes=array['node:run'];update hybrid_nodes set workspace_id='${project}'`);
 await expect(call('check',checked(),null,key)).rejects.toThrow('NODE_UNAVAILABLE');
});
it('binds project, assignee, target, current version and production step; never human decisions',async()=>{
 await call('create',creation());
 await expect(call('check',{...checked(),target:{...target,workspaceId:'foreign'}},null,key)).rejects.toThrow('TARGET_MISMATCH');
 await expect(call('check',{...checked(),runVersion:2},null,key)).rejects.toThrow('STALE_EXECUTION');
 await expect(call('check',{...checked(),stepId:'other'},null,key)).rejects.toThrow('STEP_NOT_READY');
 await expect(call('check',{...checked(),action:'human:approve'},null,key)).rejects.toThrow('ACTION_FORBIDDEN');
 await db.exec(`update circuit_executions set state=jsonb_set(state,'{definition,steps,0,assigneeId}','"${ws}"')`);
 await expect(call('check',checked(),null,key)).rejects.toThrow('STEP_FORBIDDEN');
 await db.exec(`update circuit_executions set state=jsonb_set(state,'{definition,steps,0,assigneeId}','"${node}"');update circuit_executions set state=jsonb_set(state,'{definition,steps,0,kind}','"approval"')`);
 await expect(call('check',checked(),null,key)).rejects.toThrow('STEP_FORBIDDEN');
});
it('checks real time after audit persistence and rolls back an expired approval',async()=>{
 await call('create',creation());
 await db.exec(`create function expire_during_check() returns trigger language plpgsql as $$begin if new.kind='checked' then perform pg_sleep(0.1);end if;return new;end$$;
 create trigger delay_audit before insert on project_service_delegation_audit for each row execute function expire_during_check();
 update project_service_delegations set expires_at=clock_timestamp()+interval '50 milliseconds';`);
 await expect(call('check',checked(),null,key)).rejects.toThrow('GRANT_EXPIRED');
 expect((await db.query("select * from project_service_delegation_audit where kind='checked'")).rows).toHaveLength(0);
});
it('restricts direct service-role table rights and browser RPC access',async()=>{
 const result=await db.query<{can:boolean}>("select has_table_privilege('service_role','public.project_service_delegations','INSERT') as can");expect(result.rows[0]!.can).toBe(false);
 await db.exec('set role authenticated');await expect(call('list')).rejects.toThrow('permission denied');
});
it('serves real Fastify routes over SQL; actor spoofing and personal check calls fail closed',async()=>{
 function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}):Sql {
  return Object.assign(async(strings:TemplateStringsArray,...values:unknown[])=>(await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows,{json:JSON.stringify,begin:(fn:(sql:Sql)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))}) as unknown as Sql;
 }
 const sql=adapter(db);
 const app=Fastify();let service=false;
 app.addHook('onRequest',async req=>{req.workspaceId=ws;if(service)req.apiKeyId=key;else req.userId=ws;});registerProjectServiceDelegationRoutes(app,sql,'https://organigrad.example');
 try{
  const path=`/api/projects/${project}/service-delegations`;
  expect((await app.inject({method:'POST',url:path,payload:{...creation(),userId:ws}})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url:path,payload:creation()})).statusCode).toBe(200);
  expect((await app.inject({method:'POST',url:path+'/check',payload:checked()})).statusCode).toBe(403);
  service=true;const response=await app.inject({method:'POST',url:path+'/check',payload:checked()});expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toContain('no-store');
  expect((await app.inject({url:path})).statusCode).toBe(403);
 }finally{await app.close();}
});
it('keeps the feature disabled by default and requires qualified circuit APIs',()=>{
 const env={SUPABASE_DB_URL:'postgres://test:test@127.0.0.1:5432/test',SUPABASE_JWT_SECRET:'test-only'};
 expect(loadEnv(env).projectServiceDelegationsEnabled).toBe(false);
 expect(()=>loadEnv({...env,PROJECT_SERVICE_DELEGATIONS_ENABLED:'true'})).toThrow('CIRCUITS_ENABLED');
 expect(()=>loadEnv({...env,PROJECT_SERVICE_DELEGATIONS_ENABLED:'yes'})).toThrow('PROJECT_SERVICE_DELEGATIONS_ENABLED');
 expect(loadEnv({...env,PROJECT_SERVICE_DELEGATIONS_ENABLED:'true',PROJECTS_ENABLED:'true',CIRCUITS_ENABLED:'true',APP_URL:'https://organigrad.example'}).projectServiceDelegationsEnabled).toBe(true);
});

it('fails closed for NULL scope arrays during creation and live verification',async()=>{
 await db.exec('update workspace_api_keys set scopes=null');
 await expect(call('create',creation())).rejects.toThrow('KEY_SCOPE_REQUIRED');
 await db.exec("update workspace_api_keys set scopes=array['node:run','execution:read']");
 await call('create',creation());await db.exec('update workspace_api_keys set scopes=null');
 await expect(call('check',checked(),null,key)).rejects.toThrow('KEY_SCOPE_REQUIRED');
 await expect(call('check',{...checked(),action:'execution:read'},null,key)).rejects.toThrow('KEY_SCOPE_REQUIRED');
});

it('voice assignment and resolution are explicit, bot-only and independent of runs',async()=>{
 await db.exec(`update hybrid_nodes set type='AGENT_IA' where id='${node}';insert into bot_profiles values('${node}','${ws}',true);update workspace_api_keys set scopes=array['voice:assign','voice:resolve'] where id='${key}';`);
 const voiceTarget={appId:'chat-vocal',workspaceId:'vox-native',resourceId:'77777777-7777-4777-8777-777777777777'};
 await call('create',{...creation(),target:voiceTarget,actions:['voice:assign','voice:resolve']});
 for(const action of ['voice:assign','voice:resolve']){
  const proof=await call('check',{grantId:grant,target:voiceTarget,action,nodeId:node},null,key);
  expect(proof).toMatchObject({allowed:true,action,nodeId:node,projectId:project,workspaceId:ws});expect(proof).not.toHaveProperty('runId');
 }
 function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}):Sql {
  return Object.assign(async(strings:TemplateStringsArray,...values:unknown[])=>(await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows,{json:JSON.stringify,begin:(fn:(sql:Sql)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))}) as unknown as Sql;
 }
 const sql=adapter(db);
 const api=Fastify();api.addHook('onRequest',async req=>{req.workspaceId=ws;req.apiKeyId=key;});
 registerProjectServiceDelegationRoutes(api,sql,'https://organigrad.example');
 try {
  const route=`/api/projects/${project}/service-delegations/check`;
  for(const action of ['voice:assign','voice:resolve']){
   const response=await api.inject({method:'POST',url:route,payload:{grantId:grant,target:voiceTarget,action,nodeId:node}});
   expect(response.statusCode).toBe(200);expect(response.headers['cache-control']).toContain('no-store');
   expect(response.json().project.canonicalUrl).toBe(`https://organigrad.example/?v=projects&project=${project}&workspace=${ws}`);
  }
  expect((await api.inject({method:'POST',url:route,payload:{grantId:grant,target:voiceTarget,action:'voice:assign',nodeId:node,runId:project}})).statusCode).toBe(400);
 }finally{await api.close();}
 await expect(call('check',{grantId:grant,target:voiceTarget,action:'voice:resolve',nodeId:ws},null,key)).rejects.toThrow('NODE_UNAVAILABLE');
 await db.exec(`update workspace_api_keys set scopes=array['voice:resolve'] where id='${key}'`);
 await expect(call('check',{grantId:grant,target:voiceTarget,action:'voice:assign',nodeId:node},null,key)).rejects.toThrow('KEY_SCOPE_REQUIRED');
 await db.exec(`update workspace_api_keys set scopes=array['voice:assign','voice:resolve'] where id='${key}';update bot_profiles set enabled=false where id='${node}'`);
 await expect(call('check',{grantId:grant,target:voiceTarget,action:'voice:assign',nodeId:node},null,key)).rejects.toThrow('NODE_UNAVAILABLE');
});
