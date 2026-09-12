import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { expect, it } from 'vitest';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import { PgCircuitStore } from '../src/state/pgCircuitStore.js';
import { PgCircuitScheduling } from '../src/state/pgCircuitScheduling.js';
import Fastify from 'fastify';
import { registerCircuitRoutes } from '../src/api/circuitRoutes.js';
const ws='11111111-1111-4111-8111-111111111111', project='22222222-2222-4222-8222-222222222222', grant='33333333-3333-4333-8333-333333333333';

it('configures a service schedule atomically, retries without renewal and revokes without resurrection',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create table workspace_members(workspace_id uuid,user_id uuid,role text);insert into workspace_members values('${ws}','${ws}','owner');create table workspaces(id uuid primary key);insert into workspaces values('${ws}');create table projects(id uuid primary key,workspace_id uuid references workspaces(id),archived_at timestamptz);insert into projects values('${project}','${ws}',null);`);
  for(const file of ['20260911150000_circuits.sql','20260911160000_circuit_schedules.sql'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}):Sql {
   const tag=async(strings:TemplateStringsArray,...values:unknown[])=>(await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
   return Object.assign(tag,{json:JSON.stringify,begin:(fn:(sql:Sql)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))}) as unknown as Sql;
  }
  const sql=adapter(db),store=new PgCircuitStore(sql,ws),scheduling=new PgCircuitScheduling(sql,ws);
  const definition=CircuitDefinitionSchema.parse({name:'Veille',project:{projectId:project,workspaceId:ws,sourceApp:'organigrad',canonicalUrl:'https://example.org/p'},schedule:{weekday:1,hour:7,minute:0},steps:[{id:'watch',kind:'watch',assigneeId:ws,instructions:'Veille'},{id:'final',kind:'approval',assigneeId:ws,instructions:'Valider'}]});
  const circuit=await store.saveDefinition(definition,ws);
  const expiresAt=new Date(Date.now()+14*86400000).toISOString();
  const input={idempotencyKey:grant,expectedVersion:1,expiresAt};
  await db.exec("update workspace_members set role='member'");
  await expect(scheduling.configure(circuit.id,input,ws)).rejects.toThrow('FORBIDDEN');
  await db.exec("update workspace_members set role='owner'");
  await expect(scheduling.configure(circuit.id,{...input,expiresAt:new Date(Date.now()+31*86400000).toISOString()},ws)).rejects.toThrow('INVALID_GRANT_EXPIRATION');
  await expect(scheduling.configure(circuit.id,{...input,expectedVersion:2},ws)).rejects.toThrow('STALE_CIRCUIT');
  const first=await scheduling.configure(circuit.id,input,ws);
  expect(await scheduling.read(circuit.id,ws)).toEqual(first);
  expect(first).toMatchObject({grantId:grant,enabled:false,expiresAt});
  expect(await scheduling.configure(circuit.id,input,ws)).toEqual(first);
  expect((await db.query('select * from circuit_service_grants')).rows).toHaveLength(1);
  await expect(scheduling.configure(circuit.id,{...input,expiresAt:new Date(Date.now()+15*86400000).toISOString()},ws)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await expect(new PgCircuitScheduling(sql,project).configure(circuit.id,input,ws)).rejects.toThrow('FORBIDDEN');
  await scheduling.revoke(circuit.id,grant,ws);
  expect(await scheduling.read(circuit.id,ws)).toBeNull();
  await scheduling.revoke(circuit.id,grant,ws);
  await expect(scheduling.configure(circuit.id,input,ws)).rejects.toThrow('GRANT_REVOKED');
  expect((await db.query('select * from circuit_schedule_cursors')).rows).toHaveLength(0);
  const run=await store.start(circuit.id,project,ws);
  expect(await store.getRun(run.id)).toEqual(run);
  const app=Fastify();
  app.addHook('onRequest',async req=>{req.userId=ws;req.workspaceId=ws;});
  registerCircuitRoutes(app,{sql});
  try {
   const secondGrant='44444444-4444-4444-8444-444444444444';
   const url=`/api/circuits/${circuit.id}/schedule-authorization`;
   const response=await app.inject({method:'POST',url,payload:{...input,idempotencyKey:secondGrant}});
   expect(response.statusCode).toBe(200);
   expect(response.json()).toMatchObject({authorization:{grantId:secondGrant,enabled:false}});
   const oldDue='2026-01-01T00:00:00.000Z';
   await db.query('update circuit_schedule_cursors set next_due_at=$1 where circuit_id=$2',[oldDue,circuit.id]);
   const thirdGrant='55555555-5555-4555-8555-555555555555';
   const renewal=await scheduling.configure(circuit.id,{...input,idempotencyKey:thirdGrant},ws);
   expect(renewal.nextDueAt).toBe(oldDue);
   expect((await db.query<{revoked:boolean}>('select revoked_at is not null as revoked from circuit_service_grants where id=$1',[secondGrant])).rows[0]?.revoked).toBe(true);
   expect((await app.inject({url})).json()).toMatchObject({authorization:{grantId:thirdGrant}});
   expect((await app.inject({method:'DELETE',url:url+'/'+thirdGrant})).statusCode).toBe(204);
  }finally{await app.close();}
 }finally{await db.close();}
},30000);
