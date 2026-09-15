import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { assertNativeProjectRef } from './projectRef.js';
import { orvionArtifactKinds, orvionOperations } from '../integrations/orvionServiceClient.js';
import { deliverProductionStep, ReceiptedDeliveryError, type ReceiptedDeliveryDeps } from '../orchestration/receiptedDelivery.js';
import { CircuitReceiptError, type CircuitReceiptKey, type PgCircuitReceipts } from '../state/pgCircuitReceipts.js';
import { CircuitError, type CircuitExecution } from '../orchestration/circuits.js';
import type { PgCircuitStore } from '../state/pgCircuitStore.js';

/**
 * POST /api/circuit-runs/:runId/steps/:stepId/deliver — clé de service uniquement, derrière
 * le hook Bearer. La délégation (step:execute) décide, le reçu durable garde l'effet, Orvion
 * reçoit un seul POST. Ni contenu, ni mandat, ni paramètre SQL ne sont journalisés.
 */
const target = z.object({ appId: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/), workspaceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/), resourceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/) }).strict();
const httpsUrl = z.string().max(4096).url().refine(value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } });
const body = z.object({
    grantId: z.string().uuid(), target, runVersion: z.number().int().positive(), operation: z.enum(orvionOperations),
    editorial: z.object({ boardId: z.string().uuid(), dossierId: z.string().uuid() }).strict(),
    payload: z.object({ content: z.string().min(1).max(200000), sources: z.array(httpsUrl).max(100).optional(), expectedVersion: z.number().int().min(0).optional(), kind: z.enum(orvionArtifactKinds).optional() }).strict(),
}).strict();
const params = z.object({ runId: z.string().uuid(), stepId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/) }).strict();
const conflicts = new Set(['PAYLOAD_CONFLICT', 'DELIVERY_UNRESOLVED', 'STALE_EXECUTION', 'STEP_NOT_READY', 'IDEMPOTENCY_CONFLICT', 'STALE_GRANT', 'RECEIPT_UNCERTAIN', 'RECEIPT_CONFLICT', 'RECEIPT_ACCEPTED_STATE_UNPERSISTED', 'RECEIPT_UNCERTAIN_UNPERSISTED', 'EXECUTION_NOT_ACTIVE', 'INVALID_STEP_OUTPUT', 'DOSSIER_INCOMPLETE']);
const denied = new Set(['HUMAN_SESSION_REQUIRED', 'SERVICE_KEY_REQUIRED', 'PROJECT_UNAVAILABLE', 'GRANT_UNAVAILABLE', 'GRANT_REVOKED', 'KEY_UNAVAILABLE', 'NODE_UNAVAILABLE', 'KEY_SCOPE_REQUIRED', 'TARGET_MISMATCH', 'ACTION_FORBIDDEN', 'GRANTOR_REVOKED', 'RUN_UNAVAILABLE', 'STEP_FORBIDDEN', 'GRANT_EXPIRED', 'MANDATE_UNAVAILABLE', 'RUN_NOT_FOUND']);
const invalid = new Set(['INVALID_INPUT', 'INVALID_ACTION', 'INVALID_TARGET', 'RUN_VERSION_REQUIRED', 'INVALID_RECEIPT', 'INVALID_REFERENCE', 'OUTPUT_REQUIRED']);

export interface CircuitDeliveryDeps {
    sql: Sql;
    appUrl?: string;
    orvion: ReceiptedDeliveryDeps['orvion'];
    receiptsFor(workspaceId: string): PgCircuitReceipts;
    storeFor(workspaceId: string): PgCircuitStore;
}
type CheckResult = { allowed?: boolean; grantId?: string; project?: unknown; runId?: string; runVersion?: number; stepId?: string };

export function registerCircuitDeliveryRoutes(app: FastifyInstance, deps: CircuitDeliveryDeps) {
    if (!deps.appUrl?.startsWith('https://')) throw new Error('CIRCUIT_DELIVERY_APP_URL_REQUIRED');
    app.post('/api/circuit-runs/:runId/steps/:stepId/deliver', async (req: FastifyRequest, reply: FastifyReply) => {
        reply.header('Cache-Control', 'private, no-store');
        try {
            if (!req.workspaceId) return reply.code(401).send({ error: 'AUTH_REQUIRED' });
            if (!req.apiKeyId || req.userId) return reply.code(403).send({ error: 'SERVICE_KEY_REQUIRED' });
            const workspaceId = req.workspaceId, apiKeyId = req.apiKeyId;
            const route = params.parse(req.params);
            const input = body.parse(req.body);
            const key: CircuitReceiptKey = { runId: route.runId, runVersion: input.runVersion, stepId: route.stepId };
            // Le projet du run est lu dans son état, jamais dans le corps ; la délégation le revérifie.
            const runs = await deps.sql<{ project_id: string | null }[]>`select state#>>'{definition,project,projectId}' as project_id from public.circuit_executions where id=${route.runId} and workspace_id=${workspaceId}`;
            const projectId = runs[0]?.project_id;
            if (!projectId || !z.string().uuid().safeParse(projectId).success) throw new Error('RUN_UNAVAILABLE');
            const authorize = async (k: CircuitReceiptKey) => {
                const check = { grantId: input.grantId, target: input.target, action: 'step:execute', runId: k.runId, runVersion: k.runVersion, stepId: k.stepId };
                const rows = await deps.sql.begin(async tx => {
                    await tx`select set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`;
                    return await tx<{ result: CheckResult }[]>`select public.project_service_delegation_command(${workspaceId},${projectId},${null},${apiKeyId},${'check'},${tx.json(check)}) as result`;
                }) as unknown as Array<{ result: CheckResult }>;
                const result = rows[0]?.result;
                if (!result || result.allowed !== true || result.runId !== k.runId || result.runVersion !== k.runVersion || result.stepId !== k.stepId || typeof result.grantId !== 'string') throw new Error('EMPTY_RESULT');
                return { grantId: result.grantId, project: assertNativeProjectRef(deps.appUrl, result.project, projectId, workspaceId) };
            };
            const delivered = await deliverProductionStep(
                { key, editorial: input.editorial, operation: input.operation, payload: input.payload },
                { receipts: deps.receiptsFor(workspaceId), orvion: deps.orvion, authorize, store: deps.storeFor(workspaceId), workspaceId },
            );
            const run: CircuitExecution = delivered.run;
            return { receiptId: delivered.receipt.id, reference: delivered.reference, runVersion: run.version, reused: delivered.reused };
        } catch (error) {
            if (error instanceof z.ZodError) return reply.code(400).send({ error: 'INVALID_DELIVERY_INPUT' });
            if (error instanceof ReceiptedDeliveryError) {
                if (error.code === 'ORVION_REJECTED') return reply.code(502).send({ error: 'ORVION_REJECTED', code: error.detail?.orvionCode ?? null, receiptId: error.detail?.receiptId ?? null });
                if (error.code === 'INVALID_INPUT') return reply.code(400).send({ error: error.code });
                return reply.code(409).send({ error: error.code, receiptId: error.detail?.receiptId ?? null });
            }
            const code = error instanceof Error ? error.message : '';
            if (error instanceof CircuitReceiptError || error instanceof CircuitError) {
                if (conflicts.has(code)) return reply.code(409).send({ error: code });
                if (denied.has(code)) return reply.code(403).send({ error: code });
                if (invalid.has(code)) return reply.code(400).send({ error: code });
                return reply.code(error.status).send({ error: code });
            }
            if (conflicts.has(code)) return reply.code(409).send({ error: code });
            if (denied.has(code)) return reply.code(403).send({ error: code });
            if (invalid.has(code)) return reply.code(400).send({ error: code });
            // Jamais de paramètre SQL, de contenu ni de mandat dans les journaux : seulement le type.
            req.log.error({ errorType: error instanceof Error ? error.name : 'Unknown' }, 'Circuit delivery failed');
            return reply.code(503).send({ error: 'DELIVERY_UNAVAILABLE' });
        }
    });
}
