import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Sql } from 'postgres';
import { it,expect } from 'vitest';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import { PgCircuitStore } from '../src/state/pgCircuitStore.js';
const ws='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
it('SQL: isolation, collision, snapshot et décision atomique',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create table workspace_members(workspace_id uuid,user_id uuid,role text);insert into workspace_members values('${ws}','${ws}','owner');create role authenticated;create role anon;create table public.workspaces(id uuid primary key);create table public.projects(id uuid primary key,workspace_id uuid not null references workspaces(id), archived_at timestamptz);create function public.is_workspace_member(uuid) returns boolean language sql as $$select true$$;insert into workspaces values('${ws}');insert into projects values('${project}','${ws}',null);`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260911150000_circuits.sql',import.meta.url),'utf8'));
  function adapter(client:{query: (s:string,v?:unknown[])=>Promise<{rows:unknown[]}>}) {
   const tag=async(strings:TemplateStringsArray,...values:unknown[])=> (await client.query(strings.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
   return Object.assign(tag,{json:JSON.stringify,begin:(fn:(sql:unknown)=>unknown)=>db.transaction(tx=>Promise.resolve(fn(adapter(tx))))});
  }
  const sql=adapter(db) as unknown as Sql;
  const store=new PgCircuitStore(sql,ws);
  const def=CircuitDefinitionSchema.parse({name:'Veille',project:{projectId:project,workspaceId:ws,sourceApp:'organigrad',canonicalUrl:'https://example.org/p'},steps:[{id:'choose',kind:'approval',assigneeId:ws,instructions:'Vérifier'},{id:'final',kind:'approval',assigneeId:ws,instructions:'Valider',correctionStepId:'choose'}]});
  const circuit=await store.saveDefinition(def,ws);
  const a=await store.start(circuit.id,project,ws),b=await store.start(circuit.id,project,ws);
  expect(a.id).toBe(b.id);
  await store.saveDefinition({...def,name:'Nouvelle version'},ws,circuit.id,1);
  expect((await store.getRun(a.id)).definition.name).toBe('Veille');
  await expect(store.saveDefinition(def,ws,circuit.id,1)).rejects.toThrow('STALE_CIRCUIT');
  const decision={choice:'approve' as const,stepId:'choose',expectedVersion:1,idempotencyKey:ws,channel:'link' as const,feedback:''};
  const c=await store.decide(a.id,decision,{id:ws,kind:'human'});
  expect(c.currentStepId).toBe('final');
  expect((await store.decide(a.id,decision,{id:ws,kind:'human'})).version).toBe(2);
  const other=new PgCircuitStore(sql,project);
  await expect(other.getRun(a.id)).rejects.toThrow('RUN_NOT_FOUND');
  expect(await other.list()).toEqual([]);
  const pause={action:'pause' as const,expectedVersion:2,idempotencyKey:'33333333-3333-4333-8333-333333333333'};
  expect((await store.control(a.id,pause,ws)).status).toBe('paused');
  expect((await store.control(a.id,pause,ws)).version).toBe(3);
  await sql`delete from workspace_members where workspace_id=${ws}`;
  await expect(store.decide(a.id,decision,{id:ws,kind:'human'})).rejects.toThrow('FORBIDDEN');
 }finally{await db.close();}
},30000);
