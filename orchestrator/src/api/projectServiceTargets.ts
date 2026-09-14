import type {FastifyInstance} from 'fastify';
import type {Sql} from 'postgres';
import {z} from 'zod';
import {nativeProjectRef} from './projectRef.js';

const nativeId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const query=z.object({appId:z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),workspaceId:nativeId,action:z.enum(['execution:read','voice:assign','voice:resolve']).default('execution:read'),resourceId:z.string().uuid().optional(),after:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().superRefine((value,ctx)=>{if(value.action==='execution:read'?value.resourceId!==undefined:value.appId!=='chat-vocal'||!value.resourceId)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid discovery target'});});
const resultSchema=z.object({items:z.array(z.object({grantId:z.string().uuid(),projectId:z.string().uuid(),workspaceId:z.string().uuid(),name:z.string().max(160),nodeId:z.string().uuid().optional(),nodeName:z.string().max(160).optional(),action:z.enum(['voice:assign','voice:resolve']).optional(),target:z.object({appId:z.string(),workspaceId:nativeId,resourceId:nativeId}),expiresAt:z.string().datetime({offset:true})})).max(100),nextCursor:z.string().uuid().nullable()});

/** Discovery only. Each content read must still verify the current delegation.
 * A calling application derives the native workspace from its verified client,
 * never from a browser-supplied identity. No service secret reaches the browser.
 */
export function registerProjectServiceTargetRoutes(app:FastifyInstance,sql:Sql,appUrl?:string){
 app.get('/api/service-projects',async(req,reply)=>{
  reply.header('Cache-Control','private, no-store');
  if(!req.workspaceId)return reply.code(401).send({error:'AUTH_REQUIRED'});
  if(!req.apiKeyId||req.userId)return reply.code(403).send({error:'SERVICE_KEY_REQUIRED'});
  const parsed=query.safeParse(req.query);
  if(!parsed.success)return reply.code(400).send({error:'INVALID_TARGET_QUERY'});
  const input=parsed.data;
  try{
   const rows=await sql.begin(async tx=>{
    await tx`select set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`;
    if(input.action!=='execution:read')return tx<{result:unknown}[]>`select public.list_project_service_targets(${req.workspaceId!},${req.apiKeyId!},${input.appId},${input.workspaceId},${input.after??null},${input.limit},${input.action},${input.resourceId!}) as result`;
    return tx<{result:unknown}[]>`select public.list_project_service_targets(${req.workspaceId!},${req.apiKeyId!},${input.appId},${input.workspaceId},${input.after??null},${input.limit}) as result`;
   }) as unknown as Array<{result:unknown}>;
   const result=resultSchema.parse(rows[0]?.result);
   if(result.items.some(item=>Date.parse(item.expiresAt)<=Date.now()||item.workspaceId!==req.workspaceId||item.target.appId!==input.appId||item.target.workspaceId!==input.workspaceId))throw Error('SCOPE_MISMATCH');
   if(result.items.some(item=>input.action==='execution:read'?(item.action!==undefined||item.nodeId!==undefined||item.nodeName!==undefined):(item.action!==input.action||!item.nodeId||item.nodeName===undefined||item.target.resourceId!==input.resourceId)))throw Error('ACTION_MISMATCH');
   return {items:result.items.map(item=>({grantId:item.grantId,name:item.name,...(input.action==='execution:read'?{}:{nodeId:item.nodeId,nodeName:item.nodeName,action:item.action}),target:item.target,expiresAt:item.expiresAt,project:nativeProjectRef(appUrl,item.projectId,item.workspaceId)})),nextCursor:result.nextCursor};
  }catch{return reply.code(503).send({error:'SERVICE_PROJECTS_UNAVAILABLE'});}
 });
}
