import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import type { CircuitDefinition } from '@apps2026/contracts';
import { CircuitError, nextOccurrences, startExecution } from '../orchestration/circuits.js';

interface DueCircuit {
 id:string; workspace_id:string; version:number; definition:CircuitDefinition;
 next_due_at:Date|string; grant_id:string; granted_by:string;
}
export interface ScheduleReceipt { id:string; circuitId:string; scheduledFor:string; status:'started'|'missed'; runId:string|null }
/** Persist one occurrence per circuit per tick. Safe across processes and restarts.
 * Empty project allowlist disables all scheduling, including direct callers. */
export class PgCircuitScheduler {
 constructor(private readonly sql:Sql,private readonly projectIds:readonly string[]=[]) {}
 async tick(now:string):Promise<ScheduleReceipt[]> {
  const time=Date.parse(now);
  if(!Number.isFinite(time))throw new CircuitError('INVALID_SCHEDULER_TIME',400);
  if(!this.projectIds.length)return [];
  return await this.sql.begin(async tx=>{
   // Lock grant, project and grantor membership: revocation/archive or a role
   // downgrade cannot race an accepted start.
   const rows=await tx<DueCircuit[]>`select c.id,c.workspace_id,c.version,c.definition,s.next_due_at,s.grant_id,g.granted_by
    from public.circuit_schedule_cursors s join public.team_circuits c on c.id=s.circuit_id and c.workspace_id=s.workspace_id
    join public.projects p on p.id=c.project_id and p.workspace_id=c.workspace_id
    join public.circuit_service_grants g on g.id=s.grant_id and g.workspace_id=c.workspace_id and g.project_id=c.project_id
    join public.workspace_members m on m.workspace_id=g.workspace_id and m.user_id=g.granted_by and m.role in ('owner','admin')
    where c.enabled=true and p.archived_at is null and g.revoked_at is null and g.expires_at>${now}::timestamptz
    and c.project_id in (select jsonb_array_elements_text(${JSON.stringify(this.projectIds)}::jsonb)::uuid)
    and g.action='schedule:create' and s.next_due_at<=${now}::timestamptz
    order by s.next_due_at limit 25 for update of s,c,g,p,m skip locked`;
   const receipts:ScheduleReceipt[]=[];
   for(const row of rows) {
    const schedule=row.definition.schedule;
    if(!schedule)continue;
    const scheduledFor=new Date(row.next_due_at).toISOString();
    const following=nextOccurrences(schedule,scheduledFor,1)[0]!;
    const occurrenceId=randomUUID();
    const onTime=time-Date.parse(scheduledFor)<=120000;
    const previous=await tx`select id from public.circuit_schedule_occurrences where circuit_id=${row.id} and scheduled_for=${scheduledFor}::timestamptz`;
    if(!previous[0]) {
     const run=onTime?startExecution(randomUUID(),row.definition,row.version):null;
     if(run)await tx`insert into public.circuit_executions(id,workspace_id,circuit_id,idempotency_key,created_by,version,state)
      values(${run.id},${row.workspace_id},${row.id},${occurrenceId},${row.granted_by},${run.version},${tx.json(run as unknown as Record<string,never>)})`;
     const status=run?'started':'missed';
     await tx`insert into public.circuit_schedule_occurrences(id,circuit_id,workspace_id,scheduled_for,definition_version,definition,status,run_id,grant_id,recorded_at)
      values(${occurrenceId},${row.id},${row.workspace_id},${scheduledFor}::timestamptz,${row.version},${tx.json(row.definition)},${status},${run?.id??null},${row.grant_id},${now}::timestamptz)`;
     receipts.push({id:occurrenceId,circuitId:row.id,scheduledFor,status,runId:run?.id??null});
    }
    await tx`update public.circuit_schedule_cursors set next_due_at=${following}::timestamptz where circuit_id=${row.id} and workspace_id=${row.workspace_id}`;
   }
   return receipts;
  }) as unknown as ScheduleReceipt[];
 }
}
