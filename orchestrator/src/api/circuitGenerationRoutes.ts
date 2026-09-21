import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { assertNativeProjectRef } from './projectRef.js';
import { GenerationError, settleGenerationStep, submitGenerationStep, type EngineGenerationDeps } from '../orchestration/engineGeneration.js';
import { CircuitError } from '../orchestration/circuits.js';
import { CircuitAttemptError, type CircuitAttemptKey, type PgCircuitAttempts } from '../state/pgCircuitAttempts.js';
import { CircuitReceiptError, type PgCircuitReceipts } from '../state/pgCircuitReceipts.js';
import { EngineTaskError } from '../integrations/engineTaskClient.js';
import type { PgCircuitStore } from '../state/pgCircuitStore.js';

/**
 * Étape « generation » d'un circuit, clé de service uniquement (même frontière que
 * `/deliver`) : la délégation (step:execute) décide, la tentative durable garde l'unique
 * POST vers Engine, le reçu garde la référence du résultat. Le prompt transite dans le
 * corps et n'est jamais journalisé ni stocké.
 *
 *   POST /api/circuit-runs/:runId/steps/:stepId/generate           { grantId, target, runVersion, prompt }
 *   POST /api/circuit-runs/:runId/steps/:stepId/generation-result   { grantId, target, runVersion }
 */
const target = z.object({ appId: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/), workspaceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/), resourceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/) }).strict();
const base = { grantId: z.string().uuid(), target, runVersion: z.number().int().positive() };
const submitBody = z.object({ ...base, prompt: z.string().min(1).max(2000) }).strict();
const settleBody = z.object(base).strict();
const params = z.object({ runId: z.string().uuid(), stepId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/) }).strict();
const conflicts = new Set(['STALE_EXECUTION', 'STEP_NOT_READY', 'EXECUTION_NOT_ACTIVE', 'INVALID_STEP_OUTPUT', 'DOSSIER_INCOMPLETE', 'ENGINE_WAIT_NOT_ALLOWED']);
const denied = new Set(['RUN_UNAVAILABLE', 'GRANT_UNAVAILABLE', 'GRANT_REVOKED', 'GRANT_EXPIRED', 'STEP_FORBIDDEN', 'ACTION_FORBIDDEN', 'TARGET_MISMATCH', 'PROJECT_UNAVAILABLE', 'RUN_NOT_FOUND', 'MANDATE_UNAVAILABLE']);

export interface CircuitGenerationDeps {
    sql: Sql;
    appUrl?: string;
    engine: EngineGenerationDeps['engine'];
    engineId: string;
    attemptsFor(workspaceId: string): PgCircuitAttempts;
    receiptsFor(workspaceId: string): PgCircuitReceipts;
    storeFor(workspaceId: string): PgCircuitStore;
}
type CheckResult = { allowed?: boolean; grantId?: string; project?: unknown; runId?: string; runVersion?: number; stepId?: string };

export function registerCircuitGenerationRoutes(app: FastifyInstance, deps: CircuitGenerationDeps) {
    if (!deps.appUrl?.startsWith('https://')) throw new Error('CIRCUIT_GENERATION_APP_URL_REQUIRED');
    const handler = (settle: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
        reply.header('Cache-Control', 'private, no-store');
        try {
            if (!req.workspaceId) return reply.code(401).send({ error: 'AUTH_REQUIRED' });
            if (!req.apiKeyId || req.userId) return reply.code(403).send({ error: 'SERVICE_KEY_REQUIRED' });
            const workspaceId = req.workspaceId, apiKeyId = req.apiKeyId;
            const route = params.parse(req.params);
            const input = (settle ? settleBody : submitBody).parse(req.body) as z.infer<typeof submitBody>;
            const key: CircuitAttemptKey = { runId: route.runId, runVersion: input.runVersion, stepId: route.stepId };
            const runs = await deps.sql<{ project_id: string | null }[]>`select state#>>'{definition,project,projectId}' as project_id from public.circuit_executions where id=${route.runId} and workspace_id=${workspaceId}`;
            const projectId = runs[0]?.project_id;
            if (!projectId || !z.string().uuid().safeParse(projectId).success) throw new Error('RUN_UNAVAILABLE');
            const authorize: EngineGenerationDeps['authorize'] = async (k) => {
                const check = { grantId: input.grantId, target: input.target, action: 'step:execute', runId: k.runId, runVersion: k.runVersion, stepId: k.stepId };
                const rows = await deps.sql.begin(async (tx) => {
                    await tx`select set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`;
                    return await tx<{ result: CheckResult }[]>`select public.project_service_delegation_command(${workspaceId},${projectId},${null},${apiKeyId},${'check'},${tx.json(check)}) as result`;
                }) as unknown as Array<{ result: CheckResult }>;
                const result = rows[0]?.result;
                if (!result || result.allowed !== true || result.runId !== k.runId || result.runVersion !== k.runVersion || result.stepId !== k.stepId || typeof result.grantId !== 'string') throw new Error('EMPTY_RESULT');
                return { grantId: result.grantId, project: assertNativeProjectRef(deps.appUrl, result.project, projectId, workspaceId) };
            };
            const generation: EngineGenerationDeps = { workspaceId, engineId: deps.engineId, engine: deps.engine, attempts: deps.attemptsFor(workspaceId), receipts: deps.receiptsFor(workspaceId), store: deps.storeFor(workspaceId), authorize };
            if (settle) {
                const result = await settleGenerationStep({ key }, generation);
                if (result.kind === 'pending') return reply.code(202).send({ status: result.status, jobId: result.jobId });
                return { reference: result.reference, receiptId: result.receipt.id, runVersion: result.run.version, reused: result.reused };
            }
            const result = await submitGenerationStep({ key, prompt: input.prompt }, generation);
            if (result.kind === 'waiting_engine') return reply.code(409).send({ error: 'ENGINE_UNAVAILABLE', status: result.run.status, runVersion: result.run.version });
            return { jobId: result.jobId, reused: result.reused, runVersion: result.run.version };
        } catch (error) {
            if (error instanceof z.ZodError) return reply.code(400).send({ error: 'INVALID_GENERATION_INPUT' });
            if (error instanceof GenerationError) {
                if (error.code === 'INVALID_INPUT') return reply.code(400).send({ error: error.code });
                if (error.code === 'ENGINE_JOB_FAILED' || error.code === 'ENGINE_RESULT_INVALID') return reply.code(502).send({ error: error.code, jobId: error.detail?.jobId ?? null });
                return reply.code(409).send({ error: error.code, jobId: error.detail?.jobId ?? null });
            }
            if (error instanceof EngineTaskError) return reply.code(error.code === 'ENGINE_REJECTED' ? 502 : 503).send({ error: `ENGINE_${error.code}` });
            const code = error instanceof Error ? error.message : '';
            if (error instanceof CircuitError || error instanceof CircuitAttemptError || error instanceof CircuitReceiptError) {
                if (conflicts.has(code)) return reply.code(409).send({ error: code });
                if (denied.has(code)) return reply.code(403).send({ error: code });
                return reply.code(error instanceof CircuitError ? error.status : 409).send({ error: code });
            }
            if (conflicts.has(code)) return reply.code(409).send({ error: code });
            if (denied.has(code)) return reply.code(403).send({ error: code });
            req.log.error({ errorType: error instanceof Error ? error.name : 'Unknown' }, 'Circuit generation failed');
            return reply.code(503).send({ error: 'GENERATION_UNAVAILABLE' });
        }
    };
    app.post('/api/circuit-runs/:runId/steps/:stepId/generate', handler(false));
    app.post('/api/circuit-runs/:runId/steps/:stepId/generation-result', handler(true));
}
