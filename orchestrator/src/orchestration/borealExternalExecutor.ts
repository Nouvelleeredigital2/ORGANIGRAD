import { createHash } from 'node:crypto';
import { ArtifactReferenceSchema, type ArtifactReference } from '@apps2026/contracts';
import { buildBorealStepCommand, type BorealStepCommand } from './borealStepCommand.js';
import { CircuitError, type CircuitExecution } from './circuits.js';

/** The external service may have accepted the command, but its response was lost. */
export class ExternalDeliveryUncertain extends Error {
    constructor() {
        super('EXTERNAL_DELIVERY_UNCERTAIN');
        this.name='ExternalDeliveryUncertain';
    }
}

/** Engine has not accepted a task; preserving the prompt is safer than inventing an image. */
export class EngineUnavailable extends Error {
    constructor() {
        super('ENGINE_UNAVAILABLE');
        this.name='EngineUnavailable';
    }
}

export interface ReservedReceipt {
    id:string;
    status:'reserved'|'accepted'|'uncertain';
    reference?:ArtifactReference;
}
export interface BorealReceiptPort {
    reserve(input:{
        workspaceId:string;
        runId:string;
        runVersion:number;
        stepId:string;
        project:CircuitExecution['definition']['project'];
        idempotencyKey:string;
        payloadSha256:string;
        mandateId:string;
    }):Promise<ReservedReceipt>;
    accept(receiptId:string,reference:ArtifactReference):Promise<void>;
    markUncertain(receiptId:string):Promise<void>;
}
export interface BorealExternalService {
    execute(command:BorealStepCommand):Promise<ArtifactReference>;
}
export type BorealExternalStepResult=
    | {kind:'completed';outputs:ArtifactReference[]}
    | {kind:'waiting_engine'};

function payloadSha256(command:BorealStepCommand):string {
    return createHash('sha256').update(JSON.stringify({
        project:command.project,
        runId:command.runId,
        runVersion:command.runVersion,
        stepId:command.stepId,
        operation:command.operation,
        inputs:command.inputs,
    })).digest('hex');
}

function expectedReferenceKind(run:CircuitExecution):ArtifactReference['kind'] {
    const step=run.definition.steps.find(candidate=>candidate.id===run.currentStepId);
    if(!step)throw new CircuitError('INVALID_EXECUTION');
    const expected:Partial<Record<typeof step.kind,ArtifactReference['kind']>>={
        watch:'watch', writing:'article', visual_brief:'visual_prompt', generation:'image', control:'review',
    };
    const kind=expected[step.kind];
    if(!kind)throw new CircuitError('STEP_REQUIRES_HUMAN');
    return kind;
}

function verifiedReference(run:CircuitExecution, reference:ArtifactReference):ArtifactReference {
    const parsed=ArtifactReferenceSchema.parse(reference);
    if(parsed.kind!==expectedReferenceKind(run))throw new CircuitError('INVALID_STEP_OUTPUT',400);
    if(!parsed.canonicalUrl.startsWith('https://'))throw new CircuitError('INVALID_ARTIFACT_REFERENCE',400);
    return parsed;
}

/**
 * Performs one durable external step. Persisting the resulting circuit transition is
 * deliberately a separate operation: a lost reply is never retried as a fresh call.
 */
export async function executeBorealExternalStep(
    run:CircuitExecution,
    dependencies:{mandateId:string;receipts:BorealReceiptPort;service:BorealExternalService},
):Promise<BorealExternalStepResult> {
    const command=buildBorealStepCommand(run);
    const receipt=await dependencies.receipts.reserve({
        workspaceId:run.definition.project.workspaceId,
        runId:run.id,
        runVersion:run.version,
        stepId:command.stepId,
        project:command.project,
        idempotencyKey:command.idempotencyKey,
        payloadSha256:payloadSha256(command),
        mandateId:dependencies.mandateId,
    });
    if(receipt.status==='uncertain')throw new ExternalDeliveryUncertain();
    if(receipt.status==='accepted') {
        if(!receipt.reference)throw new CircuitError('RECEIPT_REFERENCE_REQUIRED',409);
        return {kind:'completed',outputs:[verifiedReference(run,receipt.reference)]};
    }
    try {
        const reference=verifiedReference(run,await dependencies.service.execute(command));
        await dependencies.receipts.accept(receipt.id,reference);
        return {kind:'completed',outputs:[reference]};
    } catch(error) {
        if(error instanceof EngineUnavailable && command.operation==='engine:generate')return {kind:'waiting_engine'};
        if(error instanceof ExternalDeliveryUncertain)await dependencies.receipts.markUncertain(receipt.id);
        throw error;
    }
}