import { createHash } from 'node:crypto';
import type { ArtifactReference } from '@apps2026/contracts';
import { dispatchEngineStep, EngineDispatchError } from './engineDispatch.js';
import { deliveryIdempotencyKey } from './receiptedDelivery.js';
import { CircuitError, type CircuitExecution } from './circuits.js';
import { CircuitAttemptError, type CircuitAttemptKey, type PgCircuitAttempts } from '../state/pgCircuitAttempts.js';
import { CircuitReceiptError, type CircuitReceipt, type CircuitReceiptProject, type PgCircuitReceipts } from '../state/pgCircuitReceipts.js';
import { EngineTaskError, type EngineArtifactReference, type EngineImageInput, type EngineJobState, type EngineSubmittedJob } from '../integrations/engineTaskClient.js';
import type { PgCircuitStore } from '../state/pgCircuitStore.js';

/**
 * Étape « generation » d'un circuit (recette Atelier Boréal), en deux temps durables :
 *
 *   1. `submitGenerationStep` — autoriser (délégation step:execute) → dispatch durable
 *      (`dispatchEngineStep` : tentative persistée AVANT l'unique POST) → tâche Engine.
 *      Engine indisponible AVANT toute soumission ⇒ l'exécution passe explicitement en
 *      `waiting_engine` (prompt conservé chez Orvion par sa référence `visual_prompt`) ;
 *      aucune image de remplacement, aucun rejeu automatique.
 *   2. `settleGenerationStep` — relit la tâche acceptée, vérifie son résultat chez Engine,
 *      réserve puis accepte un reçu durable avec la seule RÉFÉRENCE du fichier, et
 *      complète l'étape. Une tâche encore en cours ne change rien ; une tâche échouée
 *      laisse le dossier en attente d'une décision humaine.
 *
 * Le prompt n'est jamais conservé ici : seule son empreinte (tentative) et la référence
 * du résultat (reçu, état du circuit) sont écrites.
 */
export type GenerationCode = 'INVALID_INPUT' | 'STEP_NOT_GENERATION' | 'VISUAL_PROMPT_REQUIRED' | 'GENERATION_NOT_SUBMITTED' | 'ENGINE_JOB_FAILED' | 'ENGINE_RESULT_INVALID' | 'PAYLOAD_CONFLICT' | 'DELIVERY_UNRESOLVED' | 'RECEIPT_ACCEPTED_STATE_UNPERSISTED';
export class GenerationError extends Error {
    constructor(readonly code: GenerationCode, readonly detail?: { jobId?: string; receiptId?: string; engineCode?: string }) { super(code); this.name = 'GenerationError'; }
}
export interface EngineGenerationDeps {
    workspaceId: string;
    engineId: string;
    attempts: Pick<PgCircuitAttempts, 'getReceipt' | 'reserve' | 'markDispatched' | 'recordAcceptedJob' | 'recoverExpired'>;
    engine: {
        readonly qualifiedOrigin: string;
        prepareImage(input: EngineImageInput): Promise<(submissionId: string) => Promise<EngineSubmittedJob>>;
        getResults(jobId: string): Promise<EngineJobState & { results: EngineArtifactReference[] }>;
    };
    receipts: Pick<PgCircuitReceipts, 'reserve' | 'accept'>;
    store: Pick<PgCircuitStore, 'getRun' | 'complete' | 'waitForEngine'>;
    /** Vérification de délégation (step:execute) ; rend le grant vivant et le ProjectRef du run. */
    authorize(key: CircuitAttemptKey): Promise<{ grantId: string; project: CircuitReceiptProject }>;
}
export type SubmitResult =
    | { kind: 'submitted'; jobId: string; reused: boolean; run: CircuitExecution }
    | { kind: 'waiting_engine'; run: CircuitExecution };
export type SettleResult =
    | { kind: 'pending'; status: EngineJobState['status']; jobId: string }
    | { kind: 'completed'; reference: ArtifactReference; receipt: CircuitReceipt; run: CircuitExecution; reused: boolean };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validKey(key: CircuitAttemptKey, workspaceId: string): boolean {
    return !!key && uuid.test(key.runId) && Number.isInteger(key.runVersion) && key.runVersion > 0 && typeof key.stepId === 'string' && !!key.stepId.trim() && key.stepId.length <= 128 && uuid.test(workspaceId);
}
/** L'étape courante doit être la génération, prête, avec un prompt graphique déjà livré. */
function generationStep(run: CircuitExecution, key: CircuitAttemptKey): void {
    const step = run.definition.steps.find((s) => s.id === key.stepId);
    if (!step || step.kind !== 'generation') throw new GenerationError('STEP_NOT_GENERATION');
    if (run.currentStepId === key.stepId && !Object.values(run.outputs).flat().some((ref) => ref.kind === 'visual_prompt')) throw new GenerationError('VISUAL_PROMPT_REQUIRED');
}
const engineUnavailable = (error: unknown) => error instanceof EngineTaskError && (error.code === 'ENGINE_UNAVAILABLE' || error.code === 'ENGINE_UNREACHABLE');

export async function submitGenerationStep(input: { key: CircuitAttemptKey; prompt: string }, deps: EngineGenerationDeps): Promise<SubmitResult> {
    if (!validKey(input.key, deps.workspaceId) || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 2000) throw new GenerationError('INVALID_INPUT');
    const { key } = input;
    // Forme de l'étape d'abord (lecture sans effet), puis la délégation décide.
    const run = await deps.store.getRun(key.runId);
    generationStep(run, key);
    if (run.status === 'waiting_engine') return { kind: 'waiting_engine', run };
    try { await deps.authorize(key); }
    catch (error) {
        // La délégation refuse une étape qui n'est pas prête : si c'est l'attente d'Engine, la rendre telle quelle.
        if (error instanceof Error && error.message === 'STEP_NOT_READY') {
            const fresh = await deps.store.getRun(key.runId);
            if (fresh.status === 'waiting_engine' && fresh.currentStepId === key.stepId) return { kind: 'waiting_engine', run: fresh };
        }
        throw error;
    }
    if (run.status !== 'ready') throw new CircuitError('STEP_NOT_READY');
    try {
        const { jobId, reused } = await dispatchEngineStep(key, { engineId: deps.engineId, prompt: input.prompt }, {
            attempts: deps.attempts, engine: deps.engine, authorize: async (k) => { await deps.authorize(k); },
        });
        return { kind: 'submitted', jobId, reused, run };
    } catch (error) {
        // Indisponibilité constatée AVANT toute tentative durable : rien n'a été soumis.
        if (engineUnavailable(error)) return { kind: 'waiting_engine', run: await deps.store.waitForEngine(key.runId, { stepId: key.stepId, expectedVersion: key.runVersion }) };
        if (error instanceof EngineDispatchError) {
            if (error.code === 'PAYLOAD_CONFLICT') throw new GenerationError('PAYLOAD_CONFLICT');
            if (error.code === 'DELIVERY_UNRESOLVED' || error.code === 'RECEIPT_UNPERSISTED') throw new GenerationError('DELIVERY_UNRESOLVED', { jobId: error.jobId });
            throw new GenerationError('INVALID_INPUT');
        }
        if (error instanceof CircuitAttemptError && (error.code === 'DELIVERY_UNCERTAIN' || error.code === 'PREVIOUS_DELIVERY_UNRESOLVED' || error.code === 'ATTEMPT_BUSY' || error.code === 'ATTEMPT_ALREADY_DISPATCHED')) throw new GenerationError('DELIVERY_UNRESOLVED');
        throw error;
    }
}

function referenceOf(origin: string, jobId: string, results: EngineArtifactReference[]): ArtifactReference {
    const image = results.find((item) => item.type.startsWith('image/'));
    if (!image) throw new GenerationError('ENGINE_RESULT_INVALID', { jobId });
    try {
        const url = new URL(image.downloadUrl);
        if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error();
    } catch { throw new GenerationError('ENGINE_RESULT_INVALID', { jobId }); }
    // Référence seulement : le fichier reste chez Engine, propriétaire du résultat.
    return { sourceApp: 'ned-media-engine', id: image.fileId, kind: 'image', version: 1, canonicalUrl: image.downloadUrl };
}

export async function settleGenerationStep(input: { key: CircuitAttemptKey }, deps: EngineGenerationDeps): Promise<SettleResult> {
    if (!validKey(input.key, deps.workspaceId)) throw new GenerationError('INVALID_INPUT');
    const { key } = input;
    const run = await deps.store.getRun(key.runId);
    generationStep(run, key);
    const { grantId, project } = await deps.authorize(key);
    if (!uuid.test(grantId)) throw new GenerationError('INVALID_INPUT');
    let attempt;
    try { attempt = await deps.attempts.getReceipt(key); }
    catch (error) { if (error instanceof CircuitAttemptError && error.code === 'ATTEMPT_NOT_FOUND') throw new GenerationError('GENERATION_NOT_SUBMITTED'); throw error; }
    if (attempt.status !== 'accepted' || !attempt.jobId) throw new GenerationError(attempt.status === 'reserved' ? 'GENERATION_NOT_SUBMITTED' : 'DELIVERY_UNRESOLVED');
    const jobId = attempt.jobId;
    const job = await deps.engine.getResults(jobId);
    if (job.status === 'queued' || job.status === 'running') return { kind: 'pending', status: job.status, jobId };
    if (job.status !== 'completed') throw new GenerationError('ENGINE_JOB_FAILED', { jobId, engineCode: job.status });
    const reference = referenceOf(deps.engine.qualifiedOrigin, jobId, job.results);
    const idempotencyKey = deliveryIdempotencyKey(deps.workspaceId, key);
    const payloadSha256 = createHash('sha256').update(JSON.stringify([deps.engine.qualifiedOrigin, jobId, reference.id])).digest('hex');
    let receipt: CircuitReceipt;
    try { receipt = await deps.receipts.reserve({ ...key, project, idempotencyKey, payloadSha256, mandateId: grantId }); }
    catch (error) {
        if (error instanceof CircuitReceiptError && error.code === 'RECEIPT_UNCERTAIN') throw new GenerationError('DELIVERY_UNRESOLVED');
        if (error instanceof CircuitReceiptError && error.code === 'IDEMPOTENCY_CONFLICT') throw new GenerationError('PAYLOAD_CONFLICT');
        throw error;
    }
    if (receipt.reference) {
        const isCurrent = run.version === key.runVersion && run.currentStepId === key.stepId && run.status === 'ready';
        const current = isCurrent ? await deps.store.complete(key.runId, key.stepId, key.runVersion, [receipt.reference]) : run;
        return { kind: 'completed', reference: receipt.reference, receipt, run: current, reused: true };
    }
    const accepted = await deps.receipts.accept(receipt.id, reference);
    let next: CircuitExecution;
    try { next = await deps.store.complete(key.runId, key.stepId, key.runVersion, [reference]); }
    catch { throw new GenerationError('RECEIPT_ACCEPTED_STATE_UNPERSISTED', { receiptId: accepted.id, jobId }); }
    return { kind: 'completed', reference, receipt: accepted, run: next, reused: false };
}
