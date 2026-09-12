import { createHash, randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { CircuitDefinitionSchema, type CircuitDefinition, type CircuitDecision } from '@apps2026/contracts';
import { CircuitError, startExecution, decideStep, controlExecution, nextOccurrences, type CircuitExecution } from '../orchestration/circuits.js';

export interface StoredCircuit { id:string; version:number; definition:CircuitDefinition; enabled:boolean; }
export class PgCircuitStore {
 constructor(private readonly sql:Sql,private readonly workspaceId:string){}
 private async member(tx:TransactionSql,actorId:string,admin=false) {
  const rows=await tx<{role:string}[]>`select role from public.workspace_members where workspace_id=${this.workspaceId} and user_id=${actorId} for share`;
  const role=rows[0]?.role;
  if(!role||!(admin?['owner','admin']:['owner','admin','member']).includes(role))throw new CircuitError('FORBIDDEN',403);
  return role;
 }
 async list():Promise<StoredCircuit[]> {
  return this.sql<StoredCircuit[]>`select id,version,definition,enabled from public.team_circuits where workspace_id=${this.workspaceId} order by updated_at desc limit 100`;
 }
 async saveDefinition(input:CircuitDefinition,actorId:string,id?:string,expectedVersion?:number):Promise<StoredCircuit> {
  const definition=CircuitDefinitionSchema.parse(input);
  if(definition.project.workspaceId!==this.workspaceId || definition.project.sourceApp!=='organigrad')throw new CircuitError('PROJECT_BINDING_REQUIRED',400);
  const result=await this.sql.begin(async tx=>{
   const role=await this.member(tx,actorId);
   if(definition.steps.some(step=>['approval','selection'].includes(step.kind)&&step.validatorKind==='bot')&&!['admin','owner'].includes(role))throw new CircuitError('ADMIN_REQUIRED_FOR_BOT_APPROVAL',403);
   const project=await tx`select id from public.projects where id=${definition.project.projectId} and workspace_id=${this.workspaceId} and archived_at is null for share`;
   if(!project[0])throw new CircuitError('PROJECT_NOT_FOUND',404);
   if(id) {
    if(!expectedVersion)throw new CircuitError('VERSION_REQUIRED',400);
    const previous=await tx<StoredCircuit[]>`select definition from public.team_circuits where id=${id} and workspace_id=${this.workspaceId} and version=${expectedVersion} for update`;
    if(!previous[0])throw new CircuitError('STALE_CIRCUIT');
    const rows=await tx<StoredCircuit[]>`update public.team_circuits set definition=${tx.json(definition)},version=version+1,updated_at=clock_timestamp() where id=${id} and workspace_id=${this.workspaceId} and project_id=${definition.project.projectId} and version=${expectedVersion} returning id,version,definition,enabled`;
    if(!rows[0])throw new CircuitError('STALE_CIRCUIT');
    if(JSON.stringify(previous[0].definition.schedule)!==JSON.stringify(definition.schedule)) {
     if(!definition.schedule)await tx`delete from public.circuit_schedule_cursors where circuit_id=${id} and workspace_id=${this.workspaceId}`;
     else {
      const clock=await tx<{now:Date}[]>`select clock_timestamp() as now`;
      const next=nextOccurrences(definition.schedule,new Date(clock[0]!.now).toISOString(),1)[0]!;
      await tx`update public.circuit_schedule_cursors set next_due_at=${next}::timestamptz where circuit_id=${id} and workspace_id=${this.workspaceId}`;
     }
    }
    return rows[0];
   }
   const rows=await tx<StoredCircuit[]>`insert into public.team_circuits(id,workspace_id,project_id,definition,created_by) values(${randomUUID()},${this.workspaceId},${definition.project.projectId},${tx.json(definition)},${actorId}) returning id,version,definition,enabled`;
   return rows[0]!;
  });
  return result as unknown as StoredCircuit;
 }
 async start(circuitId:string,key:string,actorId:string):Promise<CircuitExecution> {
  return await this.sql.begin(async tx=>{
   await this.member(tx,actorId);
   const circuits=await tx<StoredCircuit[]>`select c.id,c.version,c.definition,c.enabled from public.team_circuits c join public.projects p on p.id=c.project_id and p.workspace_id=c.workspace_id where c.id=${circuitId} and c.workspace_id=${this.workspaceId} and p.archived_at is null for share of c,p`;
   const circuit=circuits[0];if(!circuit)throw new CircuitError('CIRCUIT_NOT_FOUND',404);
   const run=startExecution(randomUUID(),circuit.definition,circuit.version);
   await tx`insert into public.circuit_executions(id,workspace_id,circuit_id,idempotency_key,created_by,version,state) values(${run.id},${this.workspaceId},${circuitId},${key},${actorId},${run.version},${tx.json(run as unknown as Record<string,never>)}) on conflict(workspace_id,idempotency_key) do nothing`;
   const rows=await tx<{state:CircuitExecution;circuit_id:string;created_by:string}[]>`select state,circuit_id,created_by from public.circuit_executions where workspace_id=${this.workspaceId} and idempotency_key=${key}`;
   const row=rows[0];if(!row || row.circuit_id!==circuitId || row.created_by!==actorId)throw new CircuitError('IDEMPOTENCY_CONFLICT');return row.state;
  }) as unknown as CircuitExecution;
 }
 async getRun(id:string):Promise<CircuitExecution> {
  const rows=await this.sql<{state:CircuitExecution}[]>`select state from public.circuit_executions where id=${id} and workspace_id=${this.workspaceId}`;
  if(!rows[0])throw new CircuitError('RUN_NOT_FOUND',404);return rows[0].state;
 }
 async runs():Promise<CircuitExecution[]> {
  const rows=await this.sql<{state:CircuitExecution}[]>`select state from public.circuit_executions where workspace_id=${this.workspaceId} order by updated_at desc limit 100`;
  return rows.map(row=>row.state);
 }
 async decide(id:string,input:CircuitDecision,actor:{id:string;kind:'human'|'bot'}):Promise<CircuitExecution> {
  return await this.sql.begin(async tx=>{
   if(actor.kind!=='human')throw new CircuitError('VERIFIED_BOT_BRIDGE_REQUIRED',403);
   await this.member(tx,actor.id);
   const rows=await tx<{state:CircuitExecution}[]>`select state from public.circuit_executions where id=${id} and workspace_id=${this.workspaceId} for update`;
   if(!rows[0])throw new CircuitError('RUN_NOT_FOUND',404);
   const state=decideStep(rows[0].state,input,actor);
   await tx`update public.circuit_executions set state=${tx.json(state as unknown as Record<string,never>)},version=${state.version},updated_at=clock_timestamp() where id=${id} and workspace_id=${this.workspaceId}`;
   return state;
  }) as unknown as CircuitExecution;
 }
 async control(id:string,input:{action:'pause'|'resume'|'cancel';expectedVersion:number;idempotencyKey:string},actorId:string):Promise<CircuitExecution> {
  return await this.sql.begin(async tx=>{
   await this.member(tx,actorId,true);
   const rows=await tx<{state:CircuitExecution}[]>`select state from public.circuit_executions where id=${id} and workspace_id=${this.workspaceId} for update`;
   const current=rows[0]?.state;if(!current)throw new CircuitError('RUN_NOT_FOUND',404);
   const hash=createHash('sha256').update(JSON.stringify({input,actorId})).digest('hex');
   const prior=current.decisions[input.idempotencyKey];
   if(prior) {if(prior!==hash)throw new CircuitError('IDEMPOTENCY_CONFLICT');return current;}
   const state=controlExecution(current,input.action,input.expectedVersion,actorId);
   state.decisions[input.idempotencyKey]=hash;
   await tx`update public.circuit_executions set state=${tx.json(state as unknown as Record<string,never>)},version=${state.version},updated_at=clock_timestamp() where id=${id} and workspace_id=${this.workspaceId}`;
   return state;
  }) as unknown as CircuitExecution;
 }
}
