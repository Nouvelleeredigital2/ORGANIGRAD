import type { Sql } from 'postgres';
import { ArtifactReferenceSchema, type ArtifactReference, type ProjectRef } from '@apps2026/contracts';
import type { BorealReceiptPort, ReservedReceipt } from '../orchestration/borealExternalExecutor.js';
import { CircuitError } from '../orchestration/circuits.js';

type ReceiptStatus='reserved'|'accepted'|'uncertain'|'superseded';
interface ReceiptRpc { id:string; status:ReceiptStatus; reference?:unknown; }

function verifiedProject(project:ProjectRef):ProjectRef {
    if(!project || project.sourceApp!=='organigrad' || typeof project.workspaceId!=='string' || typeof project.projectId!=='string' || typeof project.canonicalUrl!=='string' || !project.canonicalUrl.startsWith('https://'))throw new CircuitError('PROJECT_BINDING_REQUIRED',400);
    return project;
}
function readReceipt(value:unknown):ReservedReceipt {
    if(!value || typeof value!=='object')throw new CircuitError('INVALID_RECEIPT_RESPONSE',502);
    const row=value as ReceiptRpc;
    if(typeof row.id!=='string' || !['reserved','accepted','uncertain','superseded'].includes(row.status))throw new CircuitError('INVALID_RECEIPT_RESPONSE',502);
    if(row.status==='accepted' || row.status==='superseded') {
        if(!row.reference)throw new CircuitError('RECEIPT_REFERENCE_REQUIRED',502);
        return {id:row.id,status:'accepted',reference:ArtifactReferenceSchema.parse(row.reference)};
    }
    return {id:row.id,status:row.status};
}

/** Service-role-only wrapper around the installed circuit receipt RPC contract. */
export class PgCircuitReceipts implements BorealReceiptPort {
    constructor(private readonly sql:Sql) {}

    async reserve(input:{workspaceId:string;runId:string;runVersion:number;stepId:string;project:ProjectRef;idempotencyKey:string;payloadSha256:string;mandateId:string}):Promise<ReservedReceipt> {
        const project=verifiedProject(input.project);
        const projectJson=JSON.parse(JSON.stringify(project));
        const rows=await this.sql<{receipt:unknown}[]>`
            select public.circuit_receipt_reserve(
                ${input.workspaceId}::uuid,${input.runId}::uuid,${input.runVersion},${input.stepId},${this.sql.json(projectJson)}::jsonb,
                ${input.idempotencyKey}::uuid,${input.payloadSha256},${input.mandateId}::uuid
            ) as receipt
        `;
        return readReceipt(rows[0]?.receipt);
    }

    async accept(receiptId:string,reference:ArtifactReference):Promise<void> {
        const parsed=ArtifactReferenceSchema.parse(reference);
        const rows=await this.sql<{receipt:unknown}[]>`select public.circuit_receipt_accept(${receiptId}::uuid,${this.sql.json(parsed)}::jsonb) as receipt`;
        readReceipt(rows[0]?.receipt);
    }

    async markUncertain(receiptId:string):Promise<void> {
        const rows=await this.sql<{receipt:unknown}[]>`select public.circuit_receipt_mark_uncertain(${receiptId}::uuid) as receipt`;
        readReceipt(rows[0]?.receipt);
    }
}