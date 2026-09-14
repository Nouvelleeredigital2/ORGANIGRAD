import type {FastifyInstance} from 'fastify';
import type {Sql} from 'postgres';
import {z} from 'zod';
import {nativeProjectRef} from './projectRef.js';

const nativeId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const cursor=z.object({runId:z.string().uuid(),grantId:z.string().uuid()});
const query=z.object({appId:z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),workspaceId:nativeId,resourceId:nativeId,afterRun:z.string().uuid().optional(),afterGrant:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(50).default(25)}).strict().refine(v=>Boolean(v.afterRun)===Boolean(v.afterGrant));
const item=z.object({grantId:z.string().uuid(),projectId:z.string().uuid(),workspaceId:z.string().uuid(),name:z.string().max(160),nodeId:z.string().uuid(),nodeName:z.string().max(160),target:z.object({appId:z.string(),workspaceId:nativeId,resourceId:nativeId}),runId:z.string().uuid(),runVersion:z.number().int().positive(),circuitName:z.string().max(160),stepId:z.string().min(1).max(128),stepKind:z.enum(['watch','writing','visual_brief','generation','control']),expiresAt:z.string().datetime({offset:true})});
const resultSchema=z.object({items:z.array(item).max(50),nextCursor:cursor.nullable()});

/** Catalogue only: the caller must recheck the selected run/version/step before use. */
export function registerProjectServiceMissionRoutes(app:FastifyInstance,sql:Sql,appUrl?:string){
 app.get('/api/service-missions',async(req,reply)=>{
  reply.header('Cache-Control','private, no-store');
  if(!req.workspaceId)return reply.code(401).send({error:'AUTH_REQUIRED'});
  if(!req.apiKeyId||req.userId)return reply.code(403).send({error:'SERVICE_KEY_REQUIRED'});
  const parsed=query.safeParse(req.query);
  if(!parsed.success)return reply.code(400).send({error:'INVALID_MISSION_QUERY'});
  const input=parsed.data;
  try{
   const rows=await sql.begin(async tx=>{
    await tx`select set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`;
    return tx<{result:unknown}[]>`select public.list_project_service_missions(${req.workspaceId!},${req.apiKeyId!},${input.appId},${input.workspaceId},${input.resourceId},${input.afterRun??null},${input.afterGrant??null},${input.limit}) as result`;
   }) as unknown as Array<{result:unknown}>;
   const result=resultSchema.parse(rows[0]?.result);
   if(result.items.some(row=>Date.parse(row.expiresAt)<=Date.now()||row.workspaceId!==req.workspaceId||row.target.appId!==input.appId||row.target.workspaceId!==input.workspaceId||row.target.resourceId!==input.resourceId))throw Error('MISSION_SCOPE_MISMATCH');
   return {items:result.items.map(({projectId,workspaceId,...row})=>({...row,project:nativeProjectRef(appUrl,projectId,workspaceId)})),nextCursor:result.nextCursor};
  }catch{return reply.code(503).send({error:'SERVICE_MISSIONS_UNAVAILABLE'});}
 });
}
