import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { CircuitDefinitionSchema, CircuitDecisionSchema, CircuitScheduleSchema } from '@apps2026/contracts';
import { PgCircuitStore } from '../state/pgCircuitStore.js';
import { PgCircuitScheduling } from '../state/pgCircuitScheduling.js';
import { CircuitError, nextOccurrences } from '../orchestration/circuits.js';
import { hasScope, scopesForRole, type Scope } from './scopes.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value:unknown):string { if(typeof value!=='string'||!UUID.test(value))throw new CircuitError('INVALID_ID',400);return value; }
export function registerCircuitRoutes(app:FastifyInstance,deps:{sql:Sql;appUrl?:string}) {
 async function authorize(req:FastifyRequest,scope:Scope) {
  if(!req.userId||!req.workspaceId)throw new CircuitError('HUMAN_SESSION_REQUIRED',401);
  const rows=await deps.sql<{role:string}[]>`select role from public.workspace_members where workspace_id=${req.workspaceId} and user_id=${req.userId}`;
  const role=rows[0]?.role;
  if(!role||!hasScope(scopesForRole(role),scope))throw new CircuitError('FORBIDDEN',403);
  return {actorId:req.userId,role,store:new PgCircuitStore(deps.sql,req.workspaceId)};
 }
 function route(fn:(req:FastifyRequest,reply:FastifyReply)=>Promise<unknown>) {
  return async(req:FastifyRequest,reply:FastifyReply)=>{
   reply.header('Cache-Control','private, no-store');
   try{return await fn(req,reply);}catch(error){
    if(error instanceof CircuitError)return reply.code(error.status).send({error:error.code});
    if(error instanceof Error && error.name==='ZodError')return reply.code(400).send({error:'INVALID_CIRCUIT_INPUT'});
    req.log.error({errorType:error instanceof Error?error.name:'Unknown'},'Circuit operation failed');
    return reply.code(503).send({error:'CIRCUITS_UNAVAILABLE'});
   }
  };
 }
 app.get('/api/circuits',route(async req=>({circuits:await(await authorize(req,'graph:read')).store.list()})));
 app.get('/api/circuits/options',route(async req=>{
  await authorize(req,'graph:read');
  if(!deps.appUrl?.startsWith('https://'))throw new CircuitError('PROJECT_ORIGIN_UNQUALIFIED',503);
  const origin=new URL(deps.appUrl);
  if(origin.username||origin.password||origin.search||origin.hash)throw new CircuitError('PROJECT_ORIGIN_UNQUALIFIED',503);
  const projects=await deps.sql<{id:string;name:string}[]>`select id,name from public.projects where workspace_id=${req.workspaceId!} and archived_at is null order by name limit 100`;
  const humans=await deps.sql<{id:string;name:string}[]>`select m.user_id as id,coalesce(p.display_name,'Membre') as name from public.workspace_members m left join public.profiles p on p.id=m.user_id where m.workspace_id=${req.workspaceId!} and m.role in ('owner','admin','member') order by name limit 100`;
  const workers=await deps.sql<{id:string;name:string}[]>`select id,nom as name from public.hybrid_nodes where workspace_id=${req.workspaceId!} and type in ('AGENT_IA','SOFTWARE_MCP') order by nom limit 200`;
  return {projects:projects.map(project=>{
   const url=new URL(deps.appUrl!);url.search='';url.hash='';url.searchParams.set('v','projects');url.searchParams.set('project',project.id);url.searchParams.set('workspace',req.workspaceId!);
   return {name:project.name,ref:{projectId:project.id,workspaceId:req.workspaceId!,sourceApp:'organigrad',canonicalUrl:url.toString()}};
  }),humans,workers};
 }));
 app.get('/api/circuit-runs',route(async req=>({runs:await(await authorize(req,'execution:read')).store.runs()})));
 app.get('/api/circuit-runs/:id',route(async req=>({run:await(await authorize(req,'execution:read')).store.getRun(id((req.params as {id:string}).id))})));
 async function save(req:FastifyRequest,reply:FastifyReply,edit:boolean) {
  const auth=await authorize(req,'graph:write');
  const body=req.body as {definition?:unknown;expectedVersion?:number};
  if(!body||Object.keys(body).some(k=>!['definition','expectedVersion'].includes(k)))throw new CircuitError('INVALID_CIRCUIT_INPUT',400);
  const definition=CircuitDefinitionSchema.parse(body.definition);
  if(definition.steps.some(step=>['selection','approval'].includes(step.kind)&&step.validatorKind==='bot') && !['admin','owner'].includes(auth.role))throw new CircuitError('ADMIN_REQUIRED_FOR_BOT_APPROVAL',403);
  for(const step of definition.steps) {
   if(['selection','approval'].includes(step.kind)&&step.validatorKind==='human') {
    const users=await deps.sql`select user_id from public.workspace_members where workspace_id=${req.workspaceId!} and user_id=${step.assigneeId} and role in ('owner','admin','member')`;
    if(!users[0])throw new CircuitError('APPROVER_ACCOUNT_REQUIRED',400);
   } else {
    const nodes=await deps.sql`select id from public.hybrid_nodes where workspace_id=${req.workspaceId!} and id=${step.assigneeId} and type in ('AGENT_IA','SOFTWARE_MCP')`;
    if(!nodes[0])throw new CircuitError('ASSIGNEE_NOT_FOUND',400);
   }
  }
  const circuit=await auth.store.saveDefinition(definition,auth.actorId,edit?id((req.params as {id:string}).id):undefined,body.expectedVersion);
  return reply.code(edit?200:201).send({circuit});
 }
 app.post('/api/circuits',route((req,reply)=>save(req,reply,false)));
 app.put('/api/circuits/:id',route((req,reply)=>save(req,reply,true)));
 app.post('/api/circuits/preview-schedule',route(async req=>{
  await authorize(req,'graph:read');
  const schedule=CircuitScheduleSchema.parse(req.body);
  return {occurrences:nextOccurrences(schedule,new Date().toISOString())};
 }));
 app.post('/api/circuits/:id/schedule-authorization',route(async req=>{
  const auth=await authorize(req,'workspace:admin');
  const authorization=await new PgCircuitScheduling(deps.sql,req.workspaceId!).configure(id((req.params as {id:string}).id),req.body,auth.actorId);
  return {authorization};
 }));
 app.get('/api/circuits/:id/schedule-authorization',route(async req=>{
  const auth=await authorize(req,'workspace:admin');
  return {authorization:await new PgCircuitScheduling(deps.sql,req.workspaceId!).read(id((req.params as {id:string}).id),auth.actorId)};
 }));
 app.delete('/api/circuits/:id/schedule-authorization/:grantId',route(async(req,reply)=>{
  const auth=await authorize(req,'workspace:admin');
  const params=req.params as {id:string;grantId:string};
  await new PgCircuitScheduling(deps.sql,req.workspaceId!).revoke(id(params.id),id(params.grantId),auth.actorId);
  return reply.code(204).send();
 }));
 app.post('/api/circuits/:id/runs',route(async(req,reply)=>{
  const auth=await authorize(req,'node:run');const body=req.body as {idempotencyKey?:unknown};
  const run=await auth.store.start(id((req.params as {id:string}).id),id(body?.idempotencyKey),auth.actorId);
  return reply.code(201).send({run});
 }));
 app.post('/api/circuit-runs/:id/decisions',route(async req=>{
  const input=CircuitDecisionSchema.parse(req.body);
  const auth=await authorize(req,input.choice==='approve'?'human:approve':'human:reject');
  // Transport provenance must come from a verified bridge, never a browser claim.
  if(input.channel!=='organigrad')throw new CircuitError('VERIFIED_CHANNEL_BRIDGE_REQUIRED',400);
  return {run:await auth.store.decide(id((req.params as {id:string}).id),input,{id:auth.actorId,kind:'human'})};
 }));
 app.post('/api/circuit-runs/:id/control',route(async req=>{
  const auth=await authorize(req,'workspace:admin');
  const input=z.object({action:z.enum(['pause','resume','cancel']),expectedVersion:z.number().int().positive(),idempotencyKey:z.string().uuid()}).strict().parse(req.body);
  return {run:await auth.store.control(id((req.params as {id:string}).id),input,auth.actorId)};
 }));
}
