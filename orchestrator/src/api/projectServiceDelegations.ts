import { nativeProjectRef } from './projectRef.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';

const target = z.object({ appId: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/), workspaceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/), resourceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/) }).strict();
const action = z.enum(['execution:read', 'step:execute', 'voice:assign', 'voice:resolve']);
const create = z.object({ grantId: z.string().uuid(), apiKeyId: z.string().uuid(), nodeId: z.string().uuid(), target, actions: z.array(action).min(1).max(4), expiresAt: z.string().datetime() }).strict();
const revoke = z.object({ grantId: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict();
const check = z.discriminatedUnion('action', [
    z.object({grantId:z.string().uuid(),target,action:z.literal('voice:assign'),nodeId:z.string().uuid()}).strict(),
    z.object({grantId:z.string().uuid(),target,action:z.literal('voice:resolve'),nodeId:z.string().uuid()}).strict(),
    z.object({ grantId:z.string().uuid(), target, action:z.literal('execution:read'), runId:z.string().uuid() }).strict(),
    z.object({ grantId:z.string().uuid(), target, action:z.literal('step:execute'), runId:z.string().uuid(), runVersion:z.number().int().positive(), stepId:z.string().min(1).max(128) }).strict(),
]);
const conflicts = new Set(['IDEMPOTENCY_CONFLICT', 'STALE_GRANT', 'STALE_EXECUTION', 'STEP_NOT_READY']);
const denied = new Set(['HUMAN_SESSION_REQUIRED','SERVICE_KEY_REQUIRED','ADMIN_REQUIRED','PROJECT_UNAVAILABLE','GRANT_UNAVAILABLE','GRANT_REVOKED','KEY_UNAVAILABLE','NODE_UNAVAILABLE','KEY_SCOPE_REQUIRED','TARGET_MISMATCH','ACTION_FORBIDDEN','GRANTOR_REVOKED','RUN_UNAVAILABLE','STEP_FORBIDDEN','GRANT_EXPIRED']);
const invalid = new Set(['INVALID_INPUT','INVALID_ACTION','INVALID_TARGET','INVALID_EXPIRATION','RUN_VERSION_REQUIRED','VERSION_REQUIRED']);

/** Auth hook owns actor identity; the private RPC owns current locked authority. */
export function registerProjectServiceDelegationRoutes(app: FastifyInstance, sql: Sql, appUrl?: string) {
    const perform = (command: 'list'|'create'|'revoke'|'check') => async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
        reply.header('Cache-Control','private, no-store');
        try {
            if (!req.workspaceId) return reply.code(401).send({ error: 'AUTH_REQUIRED' });
            if (command === 'check' ? (!req.apiKeyId || !!req.userId) : (!req.userId || !!req.apiKeyId)) return reply.code(403).send({ error: command === 'check' ? 'SERVICE_KEY_REQUIRED' : 'HUMAN_SESSION_REQUIRED' });
            const projectId = z.string().uuid().parse((req.params as {projectId:string}).projectId);
            const input = command === 'list' ? z.object({}).strict().parse(req.query) : (command === 'create' ? create : command === 'revoke' ? revoke : check).parse(req.body);
            const rows = await sql.begin(async tx => {
                // Set before the function's statement: changing statement_timeout
                // inside an already-running function does not bound that statement.
                await tx`select set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`;
                return await tx<{result:unknown}[]>`select public.project_service_delegation_command(${req.workspaceId!},${projectId},${req.userId ?? null},${req.apiKeyId ?? null},${command},${tx.json(input)}) as result`;
            }) as unknown as Array<{result:unknown}>;
            if (!rows[0]?.result) throw new Error('EMPTY_RESULT');
            if (command === 'check') {
                const result = rows[0].result as {project?:{canonicalUrl?:string;projectId?:string;workspaceId?:string;sourceApp?:string}};
                if((input as {action?:string}).action?.startsWith('voice:')) {
                    if(result.project?.projectId!==projectId||result.project.workspaceId!==req.workspaceId||result.project.sourceApp!=='organigrad')throw Error('UNQUALIFIED_PROJECT_REFERENCE');
                    result.project=nativeProjectRef(appUrl,projectId,req.workspaceId);
                }
                const configured = new URL(appUrl ?? '');
                const canonical = new URL(result.project?.canonicalUrl ?? '');
                if (configured.protocol !== 'https:' || canonical.protocol !== 'https:' || canonical.origin !== configured.origin || canonical.username || canonical.password || canonical.searchParams.getAll('project').length !== 1 || canonical.searchParams.get('project') !== projectId || canonical.searchParams.getAll('workspace').length !== 1 || canonical.searchParams.get('workspace') !== req.workspaceId || canonical.searchParams.get('v') !== 'projects' || result.project?.projectId !== projectId || result.project.workspaceId !== req.workspaceId || result.project.sourceApp !== 'organigrad') throw new Error('UNQUALIFIED_PROJECT_REFERENCE');
            }
            return rows[0].result;
        } catch (error) {
            if (error instanceof z.ZodError) return reply.code(400).send({error:'INVALID_SERVICE_DELEGATION_INPUT'});
            const code = error instanceof Error ? error.message : '';
            if (conflicts.has(code)) return reply.code(409).send({error:code});
            if (denied.has(code)) return reply.code(403).send({error:code});
            if (invalid.has(code)) return reply.code(400).send({error:code});
            // Never log SQL parameters, credentials, or native document contents.
            return reply.code(503).send({error:'SERVICE_DELEGATIONS_UNAVAILABLE'});
        }
    };
    const path = '/api/projects/:projectId/service-delegations';
    app.get(path,perform('list'));
    app.post(path,perform('create'));
    app.post(path+'/revoke',perform('revoke'));
    app.post(path+'/check',perform('check'));
}
