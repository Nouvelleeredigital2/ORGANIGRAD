import { createHash } from 'node:crypto';
import type { ArtifactReference } from '@apps2026/contracts';
import { CircuitReceiptError, type CircuitReceipt, type CircuitReceiptKey, type CircuitReceiptProject, type PgCircuitReceipts } from '../state/pgCircuitReceipts.js';
import { OrvionServiceError, type OrvionArtifactKind, type OrvionCommandPayload, type OrvionDeliverable, type OrvionOperation } from '../integrations/orvionServiceClient.js';
import type { PgCircuitStore } from '../state/pgCircuitStore.js';
import type { CircuitExecution } from './circuits.js';

/**
 * Livraison d'une étape de production chez Atelier Orvion sous reçu durable (patron de
 * dispatchEngineStep) : autoriser → réserver → UN SEUL effet → accepter → compléter l'état.
 * Une réponse perdue laisse un reçu incertain que seul un humain résout ; aucun rejeu
 * n'émet un second POST tant que le reçu n'est pas accepté. Le contenu n'est jamais
 * conservé : seule son empreinte et la référence rendue par Orvion sont écrites.
 */
export type ReceiptedDeliveryCode = 'INVALID_INPUT' | 'PAYLOAD_CONFLICT' | 'DELIVERY_UNRESOLVED' | 'ORVION_REJECTED' | 'RECEIPT_ACCEPTED_STATE_UNPERSISTED' | 'RECEIPT_UNCERTAIN_UNPERSISTED';
export class ReceiptedDeliveryError extends Error {
    constructor(readonly code: ReceiptedDeliveryCode, readonly detail?: { receiptId?: string; httpStatus?: number; orvionCode?: string }) {
        super(code); this.name = 'ReceiptedDeliveryError';
    }
}
export interface ReceiptedDeliveryInput {
    key: CircuitReceiptKey;
    editorial: { boardId: string; dossierId: string };
    operation: OrvionOperation;
    payload: { content: string; sources?: string[]; expectedVersion?: number; kind?: OrvionArtifactKind };
}
export interface ReceiptedDeliveryDeps {
    receipts: Pick<PgCircuitReceipts, 'reserve' | 'accept' | 'markUncertain' | 'supersede' | 'lastAccepted'>;
    orvion: { readonly qualifiedOrigin: string; command(input: { operation: OrvionOperation; project: CircuitReceiptProject; boardId: string; idempotencyKey: string; payload: OrvionCommandPayload }): Promise<OrvionDeliverable> };
    /** Vérification de délégation (step:execute) ; rend le grant vivant et le ProjectRef du run. */
    authorize(key: CircuitReceiptKey): Promise<{ grantId: string; project: CircuitReceiptProject }>;
    store: Pick<PgCircuitStore, 'getRun' | 'complete'>;
    workspaceId: string;
}
export interface ReceiptedDeliveryResult { receipt: CircuitReceipt; reference: ArtifactReference; run: CircuitExecution; reused: boolean }

/** Espace de noms constant du module : la clé d'idempotence ne dépend que du quadruplet workspace/run/version/étape. */
const IDEMPOTENCY_NAMESPACE = '6f8a3c1e-2d47-5b9a-8e61-4c0f7d2a9b35';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** UUID v5 (RFC 9562 §5.5) : SHA-1 de l'espace de noms puis du nom, version 5, variante RFC. */
export function uuidV5(namespace: string, name: string): string {
    if (!uuid.test(namespace)) throw new ReceiptedDeliveryError('INVALID_INPUT');
    const digest = createHash('sha1').update(Buffer.from(namespace.replace(/-/g, ''), 'hex')).update(Buffer.from(name, 'utf8')).digest();
    digest[6] = (digest[6]! & 0x0f) | 0x50;
    digest[8] = (digest[8]! & 0x3f) | 0x80;
    const hex = digest.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
export function deliveryIdempotencyKey(workspaceId: string, key: CircuitReceiptKey): string {
    return uuidV5(IDEMPOTENCY_NAMESPACE, `${workspaceId}:${key.runId}:${key.runVersion}:${key.stepId}`);
}
/** Genre attendu par completeStep pour chaque étape de production (circuits.ts). */
const expectedKindByStep: Record<string, OrvionArtifactKind> = { watch: 'watch', writing: 'article', visual_brief: 'visual_prompt', generation: 'image', control: 'review' };
/** Genre que produit chaque opération Orvion (migration 20260915100000 d'Orvion) ; version:create prend celui du payload. */
const producedKindByOperation: Partial<Record<OrvionOperation, OrvionArtifactKind>> = { 'watch:create': 'watch', 'article:create': 'article', 'brief:create': 'brief', 'review:create': 'review', 'image:attach': 'image' };
/** L'opération doit produire exactement le genre que l'étape acceptera : refusé AVANT tout effet, jamais après.
 * Conséquence : `brief:create` (genre « brief ») ne peut pas livrer une étape visual_brief, qui exige « visual_prompt » —
 * seule `version:create` avec `kind: 'visual_prompt'` y parvient. */
function operationMatchesStep(stepKind: string, operation: OrvionOperation, payloadKind: OrvionArtifactKind | undefined): boolean {
    const expected = expectedKindByStep[stepKind];
    if (!expected) return false;
    if (operation === 'version:create') return payloadKind === expected;
    return producedKindByOperation[operation] === expected && (payloadKind === undefined || payloadKind === expected);
}
const operations: readonly OrvionOperation[] = ['watch:create', 'article:create', 'brief:create', 'review:create', 'version:create', 'image:attach'];
const kinds: readonly string[] = ['watch', 'subject', 'brief', 'article', 'visual_prompt', 'image', 'review'];
/** Sérialisation canonique (clés triées) : l'empreinte ne dépend pas de l'ordre des clés rendu par jsonb ou par zod. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value as Record<string, unknown>).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
    return JSON.stringify(value);
}
function validInput(input: ReceiptedDeliveryInput): boolean {
    const { key, editorial, payload } = input;
    return !!key && uuid.test(key.runId) && Number.isInteger(key.runVersion) && key.runVersion > 0 && typeof key.stepId === 'string' && !!key.stepId.trim() && key.stepId.length <= 128
        && !!editorial && uuid.test(editorial.boardId) && uuid.test(editorial.dossierId)
        && operations.includes(input.operation)
        && !!payload && typeof payload.content === 'string' && payload.content.length > 0 && payload.content.length <= 200000
        && (payload.sources === undefined || (Array.isArray(payload.sources) && payload.sources.length <= 100 && payload.sources.every(s => typeof s === 'string' && s.length <= 4096)))
        && (payload.expectedVersion === undefined || (Number.isInteger(payload.expectedVersion) && payload.expectedVersion >= 0))
        && (payload.kind === undefined || kinds.includes(payload.kind));
}
function isCurrent(run: CircuitExecution, key: CircuitReceiptKey): boolean {
    return run.version === key.runVersion && run.currentStepId === key.stepId && run.status === 'ready';
}
function referenceOf(deliverable: OrvionDeliverable): ArtifactReference {
    // Jamais dossierId, replayed ni contenu : la référence est ce que l'état du circuit conserve.
    return { sourceApp: deliverable.sourceApp, id: deliverable.id, kind: deliverable.kind, version: deliverable.version, canonicalUrl: deliverable.canonicalUrl };
}

export async function deliverProductionStep(input: ReceiptedDeliveryInput, deps: ReceiptedDeliveryDeps): Promise<ReceiptedDeliveryResult> {
    if (!validInput(input) || !uuid.test(deps.workspaceId)) throw new ReceiptedDeliveryError('INVALID_INPUT');
    const { key, editorial, operation } = input;
    const origin = deps.orvion.qualifiedOrigin;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error();
    } catch { throw new ReceiptedDeliveryError('INVALID_INPUT'); }
    // (a) La délégation décide ; le ProjectRef du run vient d'elle, jamais du corps de la requête.
    const { grantId, project } = await deps.authorize(key);
    if (!uuid.test(grantId)) throw new ReceiptedDeliveryError('INVALID_INPUT');
    // (b) Le genre attendu est celui de l'étape ; l'opération Orvion doit y correspondre.
    const run = await deps.store.getRun(key.runId);
    const step = run.definition.steps.find(s => s.id === key.stepId);
    if (!step || !operationMatchesStep(step.kind, operation, input.payload.kind)) throw new ReceiptedDeliveryError('INVALID_INPUT');
    // (c) Clé déterministe : stable après redémarrage, nouvelle à chaque version de run.
    const idempotencyKey = deliveryIdempotencyKey(deps.workspaceId, key);
    const payload: OrvionCommandPayload = { dossierId: editorial.dossierId, content: input.payload.content,
        ...(input.payload.sources !== undefined ? { sources: input.payload.sources } : {}),
        ...(input.payload.expectedVersion !== undefined ? { expectedVersion: input.payload.expectedVersion } : {}),
        ...(input.payload.kind !== undefined ? { kind: input.payload.kind } : {}) };
    // (d) Empreinte de la requête qualifiée ; le contenu lui-même n'est jamais stocké.
    const payloadSha256 = createHash('sha256').update(canonical({ origin, operation, project, boardId: editorial.boardId, dossierId: editorial.dossierId, payload })).digest('hex');
    // (e) Réservation durable AVANT l'effet.
    let receipt: CircuitReceipt;
    try { receipt = await deps.receipts.reserve({ ...key, project, idempotencyKey, payloadSha256, mandateId: grantId }); }
    catch (error) {
        if (error instanceof CircuitReceiptError && error.code === 'RECEIPT_UNCERTAIN') throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED');
        if (error instanceof CircuitReceiptError && error.code === 'IDEMPOTENCY_CONFLICT') throw new ReceiptedDeliveryError('PAYLOAD_CONFLICT');
        throw error;
    }
    if (receipt.reference) {
        // Déjà livré sous cette clé : la référence fait foi, aucun appel. L'état est rejoué s'il est resté en arrière.
        const current = isCurrent(run, key) ? await deps.store.complete(key.runId, key.stepId, key.runVersion, [receipt.reference]) : run;
        return { receipt, reference: receipt.reference, run: current, reused: true };
    }
    // (f) Nouvelle décision juste avant l'effet (recheckBeforeEffect).
    await deps.authorize(key);
    // (g) UN SEUL POST.
    let deliverable: OrvionDeliverable;
    try { deliverable = await deps.orvion.command({ operation, project, boardId: editorial.boardId, idempotencyKey, payload }); }
    catch (error) {
        if (error instanceof OrvionServiceError && error.code === 'DELIVERY_UNCERTAIN') {
            try { await deps.receipts.markUncertain(receipt.id); }
            catch { throw new ReceiptedDeliveryError('RECEIPT_UNCERTAIN_UNPERSISTED', { receiptId: receipt.id }); }
            throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED', { receiptId: receipt.id });
        }
        // Refus définitif : aucun effet, le reçu reste réservé et une correction du corps pourra le rejouer.
        if (error instanceof OrvionServiceError && error.code === 'ORVION_REJECTED') throw new ReceiptedDeliveryError('ORVION_REJECTED', { receiptId: receipt.id, httpStatus: error.httpStatus, orvionCode: error.orvionCode });
        throw error;
    }
    // (h) Référence seulement (jamais dossierId ni contenu), puis acceptation durable.
    const reference = referenceOf(deliverable);
    const previousControl = step.kind === 'control' ? await deps.receipts.lastAccepted({ runId: key.runId, stepId: key.stepId, excludingId: receipt.id }) : null;
    const accepted = await deps.receipts.accept(receipt.id, reference);
    // (i) Une correction invalide le contrôle dépendant ; l'ancienne référence reste en base.
    if (previousControl) await deps.receipts.supersede(previousControl.id, accepted.id);
    // (j) L'état du circuit avance ; en cas d'échec le reçu fait foi et le rejeu complètera.
    let next: CircuitExecution;
    try { next = await deps.store.complete(key.runId, key.stepId, key.runVersion, [reference]); }
    catch { throw new ReceiptedDeliveryError('RECEIPT_ACCEPTED_STATE_UNPERSISTED', { receiptId: accepted.id }); }
    return { receipt: accepted, reference, run: next, reused: false };
}
