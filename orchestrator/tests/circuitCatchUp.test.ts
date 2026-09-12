import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { expect,it } from 'vitest';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import { PgCircuitStore } from '../src/state/pgCircuitStore.js';
import { PgCircuitScheduling } from '../src/state/pgCircuitScheduling.js';
import { PgCircuitScheduler } from '../src/state/pgCircuitScheduler.js';
import Fastify from 'fastify';
import { registerCircuitRoutes } from '../src/api/circuitRoutes.js';

const ws='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',grant='33333333-3333-4333-8333-333333333333';
it('recovers a missed occurrence once with its original definition and preserves the missed receipt',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create table workspace_members(workspace_id uuid,user_id uuid,role text);insert into workspace_members values('${ws}','${ws}','owner');create table workspaces(id uuid primary key);insert into workspaces values('${ws}');create table projects(id uuid primary key,workspace_id uuid references workspaces(id),archived_at timestamptz);insert into projects values('${project}','${ws}',null);`);
  for(const file of ['20260911150000_circuits.sql','20260911160000_circuit_schedules.sql'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}):Sql {
   const tag=async(strings:TemplateStringsArray,...values:unknown[])=>(await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
   return Object.assign(tag,{json:JSON.stringify,begin:(fn:(sql:Sql)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))}) as unknown as Sql;
  }
  const sql=adapter(db),store=new PgCircuitStore(sql,ws),scheduling=new PgCircuitScheduling(sql,ws);
  const definition=CircuitDefinitionSchema.parse({name:'Veille originale',project:{projectId:project,workspaceId:ws,sourceApp:'organigrad',canonicalUrl:'https://example.org/p'},schedule:{weekday:1,hour:7,minute:0},steps:[{id:'watch',kind:'watch',assigneeId:ws,instructions:'Veille'},{id:'final',kind:'approval',assigneeId:ws,instructions:'Valider'}]});
  const circuit=await store.saveDefinition(definition,ws);
  await scheduling.configure(circuit.id,{idempotencyKey:grant,expectedVersion:1,expiresAt:new Date(Date.now()+14*86400000).toISOString()},ws);
  await db.query('update team_circuits set enabled=true where id=$1',[circuit.id]);
  await db.query("update circuit_schedule_cursors set next_due_at='2026-01-05T06:00:00Z'");
  const [missed]=await new PgCircuitScheduler(sql,[project]).tick(new Date().toISOString());
  expect(missed?.status).toBe('missed');
  const occurrenceId=missed!.id;
  const cursorBeforeEdit=(await db.query('select next_due_at from circuit_schedule_cursors')).rows;
  await store.saveDefinition({...definition,name:'Nouvelle définition'},ws,circuit.id,1);
  expect((await db.query('select next_due_at from circuit_schedule_cursors')).rows).toEqual(cursorBeforeEdit);
  expect(await scheduling.occurrences(circuit.id,ws)).toMatchObject([{id:occurrenceId,status:'missed',recoveredRunId:null}]);
  await db.exec("update workspace_members set role='member'");
  await expect(scheduling.catchUp(circuit.id,occurrenceId,ws)).rejects.toThrow('FORBIDDEN');
  await db.exec("update workspace_members set role='owner'");
  await expect(new PgCircuitScheduling(sql,project).catchUp(circuit.id,occurrenceId,ws)).rejects.toThrow('FORBIDDEN');
  const run=await scheduling.catchUp(circuit.id,occurrenceId,ws);
  expect(run.definition.name).toBe('Veille originale');
  expect(run.definitionVersion).toBe(1);
  expect(await scheduling.catchUp(circuit.id,occurrenceId,ws)).toEqual(run);
  expect((await db.query('select id from circuit_executions')).rows).toHaveLength(1);
  expect(await scheduling.occurrences(circuit.id,ws)).toMatchObject([{id:occurrenceId,status:'missed',recoveredRunId:run.id}]);
  const app=Fastify();
  app.addHook('onRequest',async req=>{req.workspaceId=ws;req.userId=ws;});
  registerCircuitRoutes(app,{sql});
  try {
   const url=`/api/circuits/${circuit.id}/occurrences`;
   expect((await app.inject({url})).json()).toMatchObject({occurrences:[{id:occurrenceId,recoveredRunId:run.id}]});
   const recovered=await app.inject({method:'POST',url:`${url}/${occurrenceId}/recover`,payload:{}});
   expect(recovered.statusCode).toBe(200);
   expect(recovered.json().run.id).toBe(run.id);
   expect((await app.inject({method:'POST',url:`${url}/${occurrenceId}/recover`,payload:{definition:{}}})).statusCode).toBe(400);
  }finally{await app.close();}
  const [second]=await new PgCircuitScheduler(sql,[project]).tick(new Date().toISOString());
  await store.start(circuit.id,second!.id,ws);
  await expect(scheduling.catchUp(circuit.id,second!.id,ws)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  expect((await scheduling.occurrences(circuit.id,ws)).find(item=>item.id===second!.id)?.recoveredRunId).toBeNull();
  await db.exec('update projects set archived_at=now()');
  await expect(scheduling.catchUp(circuit.id,occurrenceId,ws)).rejects.toThrow('CIRCUIT_NOT_FOUND');
 }finally{await db.close();}
},30000);
