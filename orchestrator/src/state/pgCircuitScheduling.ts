import type { Sql, TransactionSql } from 'postgres';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import { CircuitError, nextOccurrences } from '../orchestration/circuits.js';
import { z } from 'zod';

export const ScheduleAuthorizationSchema=z.object({
 idempotencyKey:z.string().uuid(),expectedVersion:z.number().int().positive(),expiresAt:z.string().datetime(),
}).strict();
export interface ScheduleAuthorization {grantId:string;nextDueAt:string;expiresAt:string;enabled:boolean}
interface Grant {id:string;project_id:string;granted_by:string;expires_at:Date;revoked_at:Date|null}
/** Native schedule:create grants only. No personal connection or external token. */
export class PgCircuitScheduling {
 constructor(private readonly sql:Sql,private readonly workspaceId:string){}
 private async admin(tx:TransactionSql,actorId:string) {
  const rows=await tx<{role:string}[]>`select role from public.workspace_members where workspace_id=${this.workspaceId} and user_id=${actorId} for share`;
  if(!['owner','admin'].includes(rows[0]?.role??''))throw new CircuitError('FORBIDDEN',403);
 }
 async read(circuitId:string,actorId:string):Promise<ScheduleAuthorization|null> {
  return await this.sql.begin(async tx=>{
   await this.admin(tx,actorId);
   const circuits=await tx`select id from public.team_circuits where id=${circuitId} and workspace_id=${this.workspaceId}`;
   if(!circuits[0])throw new CircuitError('CIRCUIT_NOT_FOUND',404);
   const rows=await tx<{id:string;next_due_at:Date;expires_at:Date;enabled:boolean}[]>`
    select g.id,s.next_due_at,g.expires_at,c.enabled from public.circuit_schedule_cursors s
    join public.circuit_service_grants g on g.id=s.grant_id and g.workspace_id=s.workspace_id
    join public.team_circuits c on c.id=s.circuit_id and c.workspace_id=s.workspace_id and c.project_id=g.project_id
    where c.id=${circuitId} and c.workspace_id=${this.workspaceId} and g.revoked_at is null`;
   const row=rows[0];return row?{grantId:row.id,nextDueAt:new Date(row.next_due_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),enabled:row.enabled}:null;
  }) as unknown as ScheduleAuthorization|null;
 }
 async configure(circuitId:string,raw:unknown,actorId:string):Promise<ScheduleAuthorization> {
  const input=ScheduleAuthorizationSchema.parse(raw);
  return await this.sql.begin(async tx=>{
   await this.admin(tx,actorId);
   const rows=await tx<{version:number;project_id:string;definition:unknown;enabled:boolean}[]>`
    select c.version,c.project_id,c.definition,c.enabled from public.team_circuits c
    join public.projects p on p.id=c.project_id and p.workspace_id=c.workspace_id
    where c.id=${circuitId} and c.workspace_id=${this.workspaceId} and p.archived_at is null for update of c,p`;
   const circuit=rows[0];if(!circuit)throw new CircuitError('CIRCUIT_NOT_FOUND',404);
   if(circuit.version!==input.expectedVersion)throw new CircuitError('STALE_CIRCUIT');
   const definition=CircuitDefinitionSchema.parse(circuit.definition);
   if(!definition.schedule)throw new CircuitError('SCHEDULE_REQUIRED',400);
   const grants=await tx<Grant[]>`select id,project_id,granted_by,expires_at,revoked_at from public.circuit_service_grants where id=${input.idempotencyKey} and workspace_id=${this.workspaceId} for update`;
   const grant=grants[0];
   if(grant) {
    if(grant.project_id!==circuit.project_id || grant.granted_by!==actorId || new Date(grant.expires_at).getTime()!==Date.parse(input.expiresAt))throw new CircuitError('IDEMPOTENCY_CONFLICT');
    if(grant.revoked_at)throw new CircuitError('GRANT_REVOKED');
    const cursors=await tx<{next_due_at:Date}[]>`select next_due_at from public.circuit_schedule_cursors where circuit_id=${circuitId} and workspace_id=${this.workspaceId} and grant_id=${grant.id}`;
    if(!cursors[0])throw new CircuitError('IDEMPOTENCY_CONFLICT');
    return {grantId:grant.id,nextDueAt:new Date(cursors[0].next_due_at).toISOString(),expiresAt:new Date(grant.expires_at).toISOString(),enabled:circuit.enabled};
   }
   const clocks=await tx<{now:Date}[]>`select clock_timestamp() as now`;
   const now=new Date(clocks[0]!.now),duration=Date.parse(input.expiresAt)-now.getTime();
   if(duration<=0 || duration>30*86400000)throw new CircuitError('INVALID_GRANT_EXPIRATION',400);
   const nextDueAt=nextOccurrences(definition.schedule,now.toISOString(),1)[0]!;
   if(Date.parse(nextDueAt)>=Date.parse(input.expiresAt))throw new CircuitError('GRANT_EXPIRES_BEFORE_OCCURRENCE',400);
   // Retire the previous authorization before replacing its cursor. No history deleted.
   await tx`update public.circuit_service_grants g set revoked_at=clock_timestamp()
    from public.circuit_schedule_cursors s where s.circuit_id=${circuitId} and s.workspace_id=${this.workspaceId}
    and g.id=s.grant_id and g.workspace_id=s.workspace_id and g.revoked_at is null`;
   const inserted=await tx`insert into public.circuit_service_grants(id,workspace_id,project_id,granted_by,expires_at)
    values(${input.idempotencyKey},${this.workspaceId},${circuit.project_id},${actorId},${input.expiresAt}::timestamptz)
    on conflict(id) do nothing returning id`;
   if(!inserted[0])throw new CircuitError('IDEMPOTENCY_CONFLICT');
   const cursors=await tx<{next_due_at:Date}[]>`insert into public.circuit_schedule_cursors(circuit_id,workspace_id,grant_id,next_due_at)
    values(${circuitId},${this.workspaceId},${input.idempotencyKey},${nextDueAt}::timestamptz)
    on conflict(circuit_id) do update set grant_id=excluded.grant_id returning next_due_at`;
   return {grantId:input.idempotencyKey,nextDueAt:new Date(cursors[0]!.next_due_at).toISOString(),expiresAt:new Date(input.expiresAt).toISOString(),enabled:circuit.enabled};
  }) as unknown as ScheduleAuthorization;
 }
 async revoke(circuitId:string,grantId:string,actorId:string):Promise<void> {
  await this.sql.begin(async tx=>{
   await this.admin(tx,actorId);
   const circuits=await tx<{project_id:string}[]>`select project_id from public.team_circuits where id=${circuitId} and workspace_id=${this.workspaceId} for update`;
   if(!circuits[0])throw new CircuitError('CIRCUIT_NOT_FOUND',404);
   const grants=await tx<Grant[]>`select id,project_id,granted_by,expires_at,revoked_at from public.circuit_service_grants
    where id=${grantId} and workspace_id=${this.workspaceId} and project_id=${circuits[0].project_id} for update`;
   const grant=grants[0];if(!grant)throw new CircuitError('GRANT_NOT_FOUND',404);
   if(grant.revoked_at)return;
   const cursors=await tx`select circuit_id from public.circuit_schedule_cursors where circuit_id=${circuitId} and workspace_id=${this.workspaceId} and grant_id=${grantId} for update`;
   if(!cursors[0])throw new CircuitError('GRANT_NOT_FOUND',404);
   await tx`update public.circuit_service_grants set revoked_at=clock_timestamp() where id=${grantId} and workspace_id=${this.workspaceId}`;
   await tx`delete from public.circuit_schedule_cursors where circuit_id=${circuitId} and workspace_id=${this.workspaceId} and grant_id=${grantId}`;
  });
 }
}
