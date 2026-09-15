import type { Sql } from 'postgres';
import type { ArtifactReference } from '@apps2026/contracts';

/**
 * Consommateur des reçus persistants de production (migration 20260915120000).
 * Chaque effet externe est précédé d'une réservation et suivi d'une acceptation ;
 * une réponse perdue rend le reçu incertain et bloque toute seconde écriture sous
 * la même clé. Rien d'autre que des références et des empreintes n'est écrit ici.
 */
export type CircuitReceiptStatus = 'reserved' | 'uncertain' | 'accepted' | 'superseded';
export interface CircuitReceiptProject { sourceApp: string; projectId: string; workspaceId: string; canonicalUrl: string }
export interface CircuitReceiptKey { runId: string; runVersion: number; stepId: string }
export interface CircuitReceipt extends CircuitReceiptKey {
    id: string;
    project: CircuitReceiptProject;
    idempotencyKey: string;
    payloadSha256: string;
    mandateId: string | null;
    status: CircuitReceiptStatus;
    reference: ArtifactReference | null;
    supersededBy: string | null;
}
export interface CircuitReceiptReservation extends CircuitReceiptKey {
    project: CircuitReceiptProject;
    idempotencyKey: string;
    payloadSha256: string;
    /** Grant de délégation vivant : obligatoire pour toute livraison de production. */
    mandateId: string;
}
const statuses = new Map<string, number>([
    ['INVALID_RECEIPT', 400], ['INVALID_REFERENCE', 400], ['RUN_UNAVAILABLE', 403], ['MANDATE_UNAVAILABLE', 403],
    ['IDEMPOTENCY_CONFLICT', 409], ['RECEIPT_UNCERTAIN', 409], ['RECEIPT_UNAVAILABLE', 409], ['RECEIPT_CONFLICT', 409],
    ['RECEIPT_ALREADY_SETTLED', 409], ['RECEIPT_NOT_ACCEPTED', 409], ['RECEIPT_NOT_CONTROL', 409], ['SUCCESSOR_UNAVAILABLE', 409],
]);
export class CircuitReceiptError extends Error {
    constructor(readonly code: string, readonly status = 409) { super(code); this.name = 'CircuitReceiptError'; }
}
interface Row {
    id: string; run_id: string; run_version: number; step_id: string; project: CircuitReceiptProject;
    idempotency_key: string; payload_sha256: string; mandate_id: string | null; status: CircuitReceiptStatus;
    reference: ArtifactReference | null; superseded_by: string | null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function map(row: Row): CircuitReceipt {
    return { id: row.id, runId: row.run_id, runVersion: row.run_version, stepId: row.step_id, project: row.project,
        idempotencyKey: row.idempotency_key, payloadSha256: row.payload_sha256, mandateId: row.mandate_id,
        status: row.status, reference: row.reference, supersededBy: row.superseded_by };
}
/** Les RPC lèvent leur code en message ; tout autre échec SQL remonte tel quel (indisponibilité). */
function translate(error: unknown): never {
    const code = error instanceof Error ? error.message : '';
    const status = statuses.get(code);
    if (status !== undefined) throw new CircuitReceiptError(code, status);
    throw error;
}

export class PgCircuitReceipts {
    constructor(private readonly sql: Sql, private readonly workspaceId: string) {
        if (!uuid.test(workspaceId)) throw new CircuitReceiptError('INVALID_WORKSPACE', 400);
    }
    private async rpc(call: (tx: Sql) => Promise<Array<{ r: Row }>>): Promise<CircuitReceipt> {
        let rows: Array<{ r: Row }>;
        try {
            rows = await this.sql.begin(async tx => {
                // Posé avant l'instruction de la fonction : un timeout modifié dans la fonction ne la borne pas.
                await tx`select set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`;
                return await call(tx as unknown as Sql);
            }) as unknown as Array<{ r: Row }>;
        } catch (error) { translate(error); }
        const row = rows[0]?.r;
        if (!row) throw new CircuitReceiptError('RECEIPT_UNAVAILABLE');
        return map(row);
    }
    /** Réserve AVANT l'effet ; rend le reçu existant (même clé, même empreinte), jamais un second. */
    reserve(input: CircuitReceiptReservation): Promise<CircuitReceipt> {
        if (!uuid.test(input.runId) || !uuid.test(input.idempotencyKey) || !uuid.test(input.mandateId) || !Number.isInteger(input.runVersion) || input.runVersion < 1
            || typeof input.stepId !== 'string' || !input.stepId.trim() || input.stepId.length > 128 || !/^[a-f0-9]{64}$/.test(input.payloadSha256)) throw new CircuitReceiptError('INVALID_RECEIPT', 400);
        return this.rpc(tx => tx<Array<{ r: Row }>>`select public.circuit_receipt_reserve(${this.workspaceId},${input.runId},${input.runVersion},${input.stepId},${tx.json(input.project as unknown as Record<string, never>)},${input.idempotencyKey},${input.payloadSha256},${input.mandateId}) as r`);
    }
    /** Accepte SEULEMENT après une réponse vérifiée : la référence du livrable, jamais son contenu. */
    accept(receiptId: string, reference: ArtifactReference): Promise<CircuitReceipt> {
        if (!uuid.test(receiptId)) throw new CircuitReceiptError('INVALID_RECEIPT', 400);
        const { sourceApp, id, kind, version, canonicalUrl } = reference;
        return this.rpc(tx => tx<Array<{ r: Row }>>`select public.circuit_receipt_accept(${receiptId},${tx.json({ sourceApp, id, kind, version, canonicalUrl })}) as r`);
    }
    markUncertain(receiptId: string): Promise<CircuitReceipt> {
        if (!uuid.test(receiptId)) throw new CircuitReceiptError('INVALID_RECEIPT', 400);
        return this.rpc(tx => tx<Array<{ r: Row }>>`select public.circuit_receipt_mark_uncertain(${receiptId}) as r`);
    }
    /** Une correction ne remplace qu'un reçu de contrôle accepté ; l'ancienne référence reste. */
    supersede(receiptId: string, successorId: string): Promise<CircuitReceipt> {
        if (!uuid.test(receiptId) || !uuid.test(successorId)) throw new CircuitReceiptError('INVALID_RECEIPT', 400);
        return this.rpc(tx => tx<Array<{ r: Row }>>`select public.circuit_receipt_supersede(${receiptId},${successorId}) as r`);
    }
    /** Dernier reçu accepté de cette étape (lecture directe : la connexion de l'orchestrateur est propriétaire). */
    async lastAccepted(key: { runId: string; stepId: string; excludingId?: string }): Promise<CircuitReceipt | null> {
        if (!uuid.test(key.runId) || typeof key.stepId !== 'string' || !key.stepId.trim() || key.stepId.length > 128 || (key.excludingId !== undefined && !uuid.test(key.excludingId))) throw new CircuitReceiptError('INVALID_RECEIPT', 400);
        const rows = await this.sql<Row[]>`select id,run_id,run_version,step_id,project,idempotency_key,payload_sha256,mandate_id,status,reference,superseded_by
            from public.circuit_execution_receipts where workspace_id=${this.workspaceId} and run_id=${key.runId} and step_id=${key.stepId} and status='accepted'
            and id<>${key.excludingId ?? '00000000-0000-0000-0000-000000000000'} order by run_version desc, accepted_at desc limit 1`;
        return rows[0] ? map(rows[0]) : null;
    }
}
