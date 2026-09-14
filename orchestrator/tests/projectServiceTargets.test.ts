import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it} from 'vitest';
import Fastify from 'fastify';
import type {Sql} from 'postgres';
import {registerProjectServiceTargetRoutes} from '../src/api/projectServiceTargets.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite;
const call=(key=id(3),native='client-a',after:string|null=null,limit=25)=>db.query<{result:{items:Array<{grantId:string;name:string}>;nextCursor:string|null}}>('select public.list_project_service_targets($1,$2,$3,$4,$5,$6) as result',[id(1),key,'ned-media-engine',native,after,limit]);
beforeEach(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table projects(id uuid,workspace_id uuid,name text,archived_at timestamptz);
 create table workspace_members(workspace_id uuid,user_id uuid,role text);
 create table workspace_api_keys(id uuid,workspace_id uuid,scopes text[],expires_at timestamptz,revoked_at timestamptz);
 create table hybrid_nodes(id uuid,workspace_id uuid,type text,nom text default 'Bot natif');
 create table bot_profiles(id uuid,workspace_id uuid,enabled boolean);
 create table project_service_delegations(id uuid,workspace_id uuid,project_id uuid,api_key_id uuid,node_id uuid,target jsonb,actions text[],granted_by uuid,expires_at timestamptz,revoked_at timestamptz);
 insert into projects values('${id(2)}','${id(1)}','Projet A',null),('${id(8)}','${id(1)}','Projet B',null);
 insert into workspace_members values('${id(1)}','${id(4)}','owner');
 insert into workspace_api_keys values('${id(3)}','${id(1)}',array['execution:read'],null,null),('${id(9)}','${id(1)}',array['execution:read'],null,null);
 insert into hybrid_nodes(id,workspace_id,type) values('${id(5)}','${id(1)}','SOFTWARE_MCP');
 insert into project_service_delegations values('${id(6)}','${id(1)}','${id(2)}','${id(3)}','${id(5)}','{"appId":"ned-media-engine","workspaceId":"client-a","resourceId":"generate-image"}',array['execution:read'],'${id(4)}',now()+interval '1 hour',null),('${id(7)}','${id(1)}','${id(8)}','${id(9)}','${id(5)}','{"appId":"ned-media-engine","workspaceId":"client-b","resourceId":"generate-image"}',array['execution:read'],'${id(4)}',now()+interval '1 hour',null);`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20260914150000_project_service_target_discovery.sql',import.meta.url),'utf8'));
},30000);
afterEach(async()=>{await db.close();});
it('discovers only the key and native client grants, without a second project registry',async()=>{
 expect((await call()).rows[0]!.result.items).toMatchObject([{grantId:id(6),name:'Projet A'}]);
 expect((await call(id(3),'client-b')).rows[0]!.result.items).toEqual([]);
 expect((await call(id(9),'client-a')).rows[0]!.result.items).toEqual([]);
});
it.each([
 "update workspace_members set role='member'", "update workspace_api_keys set scopes=null",
 "update project_service_delegations set revoked_at=now()", "update projects set archived_at=now()",
 "update project_service_delegations set actions=array['step:execute']", "update workspace_api_keys set expires_at=now()-interval '1 second'",
])('filters withdrawn current authority: %s',async(sql)=>{
 await db.exec(sql);expect((await call()).rows[0]!.result.items).toEqual([]);
});
it('paginates only visible grants and returns the final visible cursor',async()=>{
 await db.exec(`update project_service_delegations set api_key_id='${id(3)}',target=jsonb_set(target,'{workspaceId}','"client-a"')`);
 const first=(await call(id(3),'client-a',null,1)).rows[0]!.result;
 expect(first.items).toHaveLength(1);expect(first.nextCursor).toBe(id(6));
 const second=(await call(id(3),'client-a',first.nextCursor,1)).rows[0]!.result;
 expect(second.items).toMatchObject([{grantId:id(7)}]);expect(second.nextCursor).toBeNull();
});
it('does not grant browser or direct table privileges',async()=>{
 expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.list_project_service_targets(uuid,uuid,text,text,uuid,integer)','EXECUTE') as allowed")).rows[0]!.allowed).toBe(false);
});
it('does not advertise a human node or a lifetime longer than the service key',async()=>{
 await db.exec("update hybrid_nodes set type='HUMAN'");expect((await call()).rows[0]!.result.items).toEqual([]);
 await db.exec("update hybrid_nodes set type='SOFTWARE_MCP';update workspace_api_keys set expires_at=clock_timestamp()+interval '10 seconds'");
 const row=(await db.query<{result:{items:Array<{expiresAt:string}>}}>('select public.list_project_service_targets($1,$2,$3,$4) as result',[id(1),id(3),'ned-media-engine','client-a'])).rows[0]!.result.items[0]!;
 expect(Date.parse(row.expiresAt)-Date.now()).toBeLessThanOrEqual(10000);
});
it('constructs the native project link server-side and refuses a human session',async()=>{
 function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}):Sql {
  return Object.assign(async(strings:TemplateStringsArray,...values:unknown[])=>(await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows,{begin:(fn:(sql:Sql)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))}) as unknown as Sql;
 }
 const sql=adapter(db);
 const app=Fastify();app.addHook('onRequest',async req=>{req.workspaceId=id(1);if(req.headers['x-fixture-human'])req.userId=id(4);else req.apiKeyId=id(3);});
 registerProjectServiceTargetRoutes(app,sql,'https://organigrad.example');
 try{
  const url='/api/service-projects?appId=ned-media-engine&workspaceId=client-a';
  const result=await app.inject({url});expect(result.statusCode).toBe(200);
  expect(result.json().items[0].project).toEqual({sourceApp:'organigrad',projectId:id(2),workspaceId:id(1),canonicalUrl:`https://organigrad.example/?v=projects&project=${id(2)}&workspace=${id(1)}`});
  expect((await app.inject({url,headers:{'x-fixture-human':'yes'}})).statusCode).toBe(403);
  expect((await app.inject({url:url+'&apiKeyId='+id(9)})).statusCode).toBe(400);
  await voiceFixture();
  const vocal='/api/service-projects?appId=chat-vocal&workspaceId=vox-a&action=voice:assign&resourceId='+id(21);
  const vocalResult=await app.inject({url:vocal});expect(vocalResult.statusCode).toBe(200);expect(vocalResult.json().items[0]).toMatchObject({nodeId:id(5),nodeName:'Bot natif',action:'voice:assign'});
  expect((await app.inject({url:'/api/service-projects?appId=chat-vocal&workspaceId=vox-a&action=voice:assign'})).statusCode).toBe(400);
  expect((await app.inject({url:url+'&resourceId='+id(21)})).statusCode).toBe(400);

 }finally{await app.close();}
});

it('does not expose a catalogue entry that expired before the HTTP response',async()=>{
 const app=Fastify();app.addHook('onRequest',async req=>{req.workspaceId=id(1);req.apiKeyId=id(3);});
 const sql={begin:async()=>{
  await db.exec("update project_service_delegations set expires_at=clock_timestamp()+interval '80 milliseconds'");
  const rows=(await call()).rows;expect(rows[0]!.result.items).toHaveLength(1);
  await new Promise(resolve=>setTimeout(resolve,120));return rows;
 }} as unknown as Sql;
 registerProjectServiceTargetRoutes(app,sql,'https://organigrad.example');
 try{const response=await app.inject({url:'/api/service-projects?appId=ned-media-engine&workspaceId=client-a'});expect(response.statusCode).toBe(503);expect(response.body).not.toContain('Projet A');}
 finally{await app.close();}
});

const voiceCall=(action='voice:assign',resource=id(21))=>db.query<{result:{items:Array<{nodeId:string;nodeName:string;action:string}>}}> ('select public.list_project_service_targets($1,$2,$3,$4,$5,$6,$7,$8) as result',[id(1),id(3),'chat-vocal','vox-a',null,25,action,resource]);
async function voiceFixture(){await db.exec(`update hybrid_nodes set type='AGENT_IA';insert into bot_profiles values('${id(5)}','${id(1)}',true);update workspace_api_keys set scopes=array['voice:assign'];update project_service_delegations set actions=array['voice:assign'],target='{"appId":"chat-vocal","workspaceId":"vox-a","resourceId":"${id(21)}"}' where id='${id(6)}'`);}
it('discovers voice only with explicit action, native voice and enabled bot, keeping six-argument read unchanged',async()=>{
 await voiceFixture();expect((await voiceCall()).rows[0]!.result.items).toMatchObject([{nodeId:id(5),nodeName:'Bot natif',action:'voice:assign'}]);
 expect((await voiceCall('voice:resolve')).rows[0]!.result.items).toEqual([]);expect((await voiceCall('voice:assign',id(22))).rows[0]!.result.items).toEqual([]);expect((await call()).rows[0]!.result.items).toEqual([]);
});
it.each(["update bot_profiles set enabled=false","delete from bot_profiles","update hybrid_nodes set type='SOFTWARE_MCP'","update workspace_api_keys set scopes=null"] )('voice discovery refuses missing current prerequisites: %s',async sql=>{await voiceFixture();await db.exec(sql);expect((await voiceCall()).rows[0]!.result.items).toEqual([]);});
it('refuses malformed or execution actions on the vocal overload',async()=>{await expect(voiceCall('execution:read')).rejects.toThrow('INVALID_TARGET_QUERY');await expect(voiceCall('voice:assign','other')).rejects.toThrow('INVALID_TARGET_QUERY');});
