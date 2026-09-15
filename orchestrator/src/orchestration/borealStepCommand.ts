import { createHash } from 'node:crypto';
import type { ArtifactReference, ProjectRef } from '@apps2026/contracts';
import { CircuitError, type CircuitExecution } from './circuits.js';

export type BorealServiceOperation='watch:create'|'article:create'|'brief:create'|'review:create'|'engine:generate'|'image:attach';
export interface BorealStepCommand {
    project:ProjectRef;
    runId:string;
    runVersion:number;
    stepId:string;
    assigneeId:string;
    operation:BorealServiceOperation;
    inputs:ArtifactReference[];
    /** Stable per run revision and step, for service-side retries after a lost reply. */
    idempotencyKey:string;
}

const namespace=Buffer.from('e2b7e0f194644be9a4f67f703b9d4a13','hex');
function uuidV5(value:string):string {
    const hash=createHash('sha1').update(namespace).update(value).digest();
    hash[6]=(hash[6]!&0x0f)|0x50;hash[8]=(hash[8]!&0x3f)|0x80;
    const hex=hash.subarray(0,16).toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function inputOf(run:CircuitExecution,kind:ArtifactReference['kind'],error:string):ArtifactReference {
    const value=Object.values(run.outputs).flat().find(item=>item.kind===kind);
    if(!value)throw new CircuitError(error,400);
    return value;
}

/** Creates a service command from a persisted circuit state without copying editorial content. */
export function buildBorealStepCommand(run:CircuitExecution):BorealStepCommand {
    if(run.status!=='ready')throw new CircuitError('STEP_NOT_READY');
    if(run.definition.project.sourceApp!=='organigrad')throw new CircuitError('PROJECT_BINDING_REQUIRED',400);
    const step=run.definition.steps.find(candidate=>candidate.id===run.currentStepId);
    if(!step)throw new CircuitError('INVALID_EXECUTION');
    let operation:BorealServiceOperation;
    let inputs:ArtifactReference[];
    switch(step.kind) {
        case 'watch': operation='watch:create';inputs=[];break;
        case 'writing': operation='article:create';inputs=[inputOf(run,'subject','SUBJECT_REQUIRED')];break;
        case 'visual_brief': operation='brief:create';inputs=[inputOf(run,'article','ARTICLE_REQUIRED')];break;
        case 'generation': operation='engine:generate';inputs=[inputOf(run,'visual_prompt','VISUAL_PROMPT_REQUIRED')];break;
        case 'control': operation='review:create';inputs=[inputOf(run,'article','ARTICLE_REQUIRED'),inputOf(run,'visual_prompt','VISUAL_PROMPT_REQUIRED'),inputOf(run,'image','IMAGE_REQUIRED')];break;
        default: throw new CircuitError('STEP_REQUIRES_HUMAN');
    }
    return {
        project:run.definition.project,runId:run.id,runVersion:run.version,stepId:step.id,assigneeId:step.assigneeId,
        operation,inputs,idempotencyKey:uuidV5(`${run.id}:${run.version}:${step.id}`),
    };
}
