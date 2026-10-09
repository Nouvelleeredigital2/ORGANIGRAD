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
export interface DeliveryItem {
    operation: OrvionOperation;
    payload: { content: string; sources?: string[]; expectedVersion?: number; kind?: OrvionArtifactKind };
}
interface SingleDeliveryInput extends DeliveryItem {
    key: CircuitReceiptKey;
    editorial: { boardId: string; dossierId: string };
}
export type ReceiptedDeliveryInput = SingleDeliveryInput | {
    key: CircuitReceiptKey; editorial: { boardId: string; dossierId: string }; deliveries: DeliveryItem[];
};
export interface ReceiptedDeliveryDeps {
    receipts: Pick<PgCircuitReceipts, 'reserveForDispatch' | 'accept' | 'supersede' | 'lastAccepted'>;
    orvion: { readonly qualifiedOrigin: string; command(input: { operation: OrvionOperation; project: CircuitReceiptProject; boardId: string; idempotencyKey: string; payload: OrvionCommandPayload }): Promise<OrvionDeliverable> };
    /** Vérification de délégation (step:execute) ; rend le grant vivant et le ProjectRef du run. */
    authorize(key: CircuitReceiptKey): Promise<{ grantId: string; project: CircuitReceiptProject }>;
    store: Pick<PgCircuitStore, 'getRun' | 'complete'>;
    workspaceId: string;
}
export interface ReceiptedDeliveryResult { receipt: CircuitReceipt; reference: ArtifactReference; receipts: CircuitReceipt[]; references: ArtifactReference[]; run: CircuitExecution; reused: boolean }

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
export function deliveryIdempotencyKey(workspaceId: string, key: CircuitReceiptKey, position = 0): string {
    return uuidV5(IDEMPOTENCY_NAMESPACE, `${workspaceId}:${key.runId}:${key.runVersion}:${key.stepId}${position ? ':item:' + position : ''}`);
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
function validInput(input: SingleDeliveryInput): boolean {
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
    const { key, editorial } = input;
    const items: DeliveryItem[] = 'deliveries' in input ? input.deliveries : [{ operation: input.operation, payload: input.payload }];
    if (!Array.isArray(items) || !items.length || items.length > 11 || !uuid.test(deps.workspaceId)
        || ('deliveries' in input && ('operation' in input || 'payload' in input))
        || items.some(item => !item || !validInput({key, editorial, ...item}))) throw new ReceiptedDeliveryError('INVALID_INPUT');
    const origin = deps.orvion.qualifiedOrigin;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error();
    } catch { throw new ReceiptedDeliveryError('INVALID_INPUT'); }
    const { grantId, project } = await deps.authorize(key);
    if (!uuid.test(grantId)) throw new ReceiptedDeliveryError('INVALID_INPUT');
    const run = await deps.store.getRun(key.runId);
    const step = run.definition.steps.find(s => s.id === key.stepId);
    const nextStep = run.definition.steps[run.definition.steps.findIndex(s => s.id === key.stepId) + 1];
    // Validate the WHOLE list before the first effect. Watch may additionally
    // produce subjects; all other steps retain a single required deliverable.
    if (!step || (step.kind === 'watch' && nextStep?.kind === 'selection' && items.length < 2)
        || !operationMatchesStep(step.kind, items[0]!.operation, items[0]!.payload.kind)
        || items.slice(1).some(item => step.kind !== 'watch' || item.operation !== 'version:create' || item.payload.kind !== 'subject')) {
        throw new ReceiptedDeliveryError('INVALID_INPUT');
    }
    const commands = items.map(item => ({ operation: item.operation, payload: {
        dossierId: editorial.dossierId, content: item.payload.content,
        ...(item.payload.sources !== undefined ? { sources: item.payload.sources } : {}),
        ...(item.payload.expectedVersion !== undefined ? { expectedVersion: item.payload.expectedVersion } : {}),
        ...(item.payload.kind !== undefined ? { kind: item.payload.kind } : {}),
    } }));
    // Every slot commits the full manifest. Position zero shares the old key:
    // switching request forms or dropping a subject cannot create a new batch.
    const manifest = createHash('sha256').update(canonical(commands)).digest('hex');
    const acceptedReceipts: CircuitReceipt[] = [];
    const references: ArtifactReference[] = [];
    let reused = true;
    for (let position = 0; position < commands.length; position++) {
        const { operation, payload } = commands[position]!;
        const idempotencyKey = deliveryIdempotencyKey(deps.workspaceId, key, position);
        const qualified = { origin, operation, project, boardId: editorial.boardId, dossierId: editorial.dossierId, payload };
        // Preserve fingerprints of existing mono deliveries, but a list of >1
        // is immutable as a whole. No contents are persisted, only this hash.
        const payloadSha256 = createHash('sha256').update(canonical(commands.length === 1 ? qualified : {...qualified, manifest})).digest('hex');
        let receipt: CircuitReceipt;
        let dispatchAllowed: boolean;
        try {
            ({receipt, dispatchAllowed} = await deps.receipts.reserveForDispatch({...key, project, idempotencyKey, payloadSha256, mandateId: grantId}));
        } catch (error) {
            if (error instanceof CircuitReceiptError && error.code === 'RECEIPT_UNCERTAIN') throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED');
            if (error instanceof CircuitReceiptError && error.code === 'IDEMPOTENCY_CONFLICT') throw new ReceiptedDeliveryError('PAYLOAD_CONFLICT');
            throw error;
        }
        if (!receipt.reference) {
            if (!dispatchAllowed) throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED', {receiptId: receipt.id});
            // Uncertainty was durably committed before this point, so every
            // crash/error path remains closed even if its catch block never runs.
            const fresh = await deps.authorize(key);
            if (fresh.grantId !== grantId || canonical(fresh.project) !== canonical(project)) throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED', {receiptId: receipt.id});
            let deliverable: OrvionDeliverable;
            try { deliverable = await deps.orvion.command({operation, project, boardId: editorial.boardId, idempotencyKey, payload}); }
            catch (error) {
                if (error instanceof OrvionServiceError && error.code === 'ORVION_REJECTED') throw new ReceiptedDeliveryError('ORVION_REJECTED', {receiptId:receipt.id,httpStatus:error.httpStatus,orvionCode:error.orvionCode});
                throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED', {receiptId:receipt.id});
            }
            const expected = operation === 'version:create' ? payload.kind : producedKindByOperation[operation];
            if (deliverable.kind !== expected || deliverable.boardId !== editorial.boardId || deliverable.dossierId !== editorial.dossierId) {
                throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED', {receiptId:receipt.id});
            }
            receipt = await deps.receipts.accept(receipt.id, referenceOf(deliverable));
            reused = false;
        }
        if (!receipt.reference) throw new ReceiptedDeliveryError('DELIVERY_UNRESOLVED', {receiptId:receipt.id});
        // Also run on replay: a crash after accept must not lose invalidation.
        if (step.kind === 'control') {
            const previous = await deps.receipts.lastAccepted({runId:key.runId,stepId:key.stepId,excludingId:receipt.id});
            if (previous) await deps.receipts.supersede(previous.id,receipt.id);
        }
        acceptedReceipts.push(receipt);
        references.push(receipt.reference);
    }
    let next = run;
    try { if (isCurrent(run,key)) next = await deps.store.complete(key.runId,key.stepId,key.runVersion,references); }
    catch { throw new ReceiptedDeliveryError('RECEIPT_ACCEPTED_STATE_UNPERSISTED', {receiptId:acceptedReceipts[0]!.id}); }
    return {receipt:acceptedReceipts[0]!,reference:references[0]!,receipts:acceptedReceipts,references,run:next,reused};
}
