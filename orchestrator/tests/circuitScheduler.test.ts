import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { it, expect } from 'vitest';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import { PgCircuitStore } from '../src/state/pgCircuitStore.js';
import { PgCircuitScheduler } from '../src/state/pgCircuitScheduler.js';
const ws='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
it('SQL : une occurrence unique, retard signalé, grant révoqué et pause respectés',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create table workspace_members(workspace_id uuid,user_id uuid,role text);insert into workspace_members values('${ws}','${ws}','owner');create role authenticated;create role anon;create table workspaces(id uuid primary key);create table projects(id uuid primary key,workspace_id uuid not null references workspaces(id),archived_at timestamptz);insert into workspaces values('${ws}');insert into projects values('${project}','${ws}',null);`);
  for(const file of ['20260911150000_circuits.sql','20260911160000_circuit_schedules.sql'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  function adapter(client:{query:(s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}) {
   const tag=async(strings:TemplateStringsArray,...values:unknown[])=> (await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
   return Object.assign(tag,{json:JSON.stringify,begin:(fn:(sql:unknown)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))});
  }
  const sql=adapter(db) as unknown as Sql;
  const store=new PgCircuitStore(sql,ws),scheduler=new PgCircuitScheduler(sql);
  const definition=CircuitDefinitionSchema.parse({name:'Lundi',project:{projectId:project,workspaceId:ws,sourceApp:'organigrad',canonicalUrl:'https://example.org/p'},schedule:{weekday:1,hour:7,minute:0,timeZone:'Europe/Paris'},steps:[{id:'watch',kind:'watch',assigneeId:ws,instructions:'Veille'},{id:'final',kind:'approval',assigneeId:ws,instructions:'Valider'}]});
  const circuit=await store.saveDefinition(definition,ws);
  await db.query('insert into circuit_service_grants(id,workspace_id,project_id,granted_by,expires_at) values($1,$2,$3,$2,$4)',[ws,ws,project,'2027-01-01']);
  await db.query('insert into circuit_schedule_cursors(circuit_id,workspace_id,grant_id,next_due_at) values($1,$2,$2,$3)',[circuit.id,ws,'2026-09-14T05:00:00Z']);
  // A draft is never started, even if a cursor was prepared.
  expect(await scheduler.tick('2026-09-14T05:00:30Z')).toEqual([]);
  await db.query('update team_circuits set enabled=true where id=$1',[circuit.id]);
  // A grant cannot outlive the current authority of its grantor.
  await db.exec("update workspace_members set role='viewer'");
  expect(await scheduler.tick('2026-09-14T05:00:30Z')).toEqual([]);
  expect(await store.runs()).toHaveLength(0);
  await db.exec('delete from workspace_members');
  expect(await scheduler.tick('2026-09-14T05:00:30Z')).toEqual([]);
  await db.query('insert into workspace_members values($1,$1,$2)',[ws,'owner']);
  expect(await scheduler.tick('2026-09-14T05:00:30Z')).toMatchObject([{status:'started'}]);
  expect(await scheduler.tick('2026-09-14T05:00:30Z')).toEqual([]);
  expect((await store.runs())).toHaveLength(1);
  // A long outage records missed occurrences, with no automatic catch-up jobs.
  expect(await scheduler.tick('2026-10-01T05:00:00Z')).toMatchObject([{status:'missed'}]);
  await scheduler.tick('2026-10-01T05:00:00Z');
  expect(await store.runs()).toHaveLength(1);
  await db.query('update circuit_service_grants set revoked_at=$1 where id=$2',['2026-10-02',ws]);
  expect(await scheduler.tick('2026-10-05T05:00:30Z')).toEqual([]);
  expect(await store.runs()).toHaveLength(1);
  expect((await db.query("select status from circuit_schedule_occurrences order by scheduled_for")).rows).toEqual([{status:'started'},{status:'missed'},{status:'missed'}]);
 }finally {await db.close();}
},30000);
