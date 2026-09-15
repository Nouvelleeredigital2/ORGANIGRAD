import { createHash } from 'node:crypto';
import { ArtifactReferenceSchema, CircuitDecisionSchema, CircuitDefinitionSchema, CircuitScheduleSchema,
    type ArtifactReference, type CircuitDecision, type CircuitDefinition, type CircuitSchedule } from '@apps2026/contracts';

export class CircuitError extends Error {
    constructor(readonly code: string, readonly status = 409) { super(code); }
}
export type ExecutionStatus = 'ready' | 'waiting_approval' | 'paused' | 'cancelled' | 'ready_to_publish' | 'blocked';
export interface CircuitExecution {
    id: string;
    scheduleOrigin?: { occurrenceId: string; scheduledFor: string; recoveredBy: string };
    definition: CircuitDefinition;
    definitionVersion: number;
    version: number;
    status: ExecutionStatus;
    suspendedStatus?: Exclude<ExecutionStatus,'paused'|'cancelled'|'ready_to_publish'>;
    currentStepId: string;
    outputs: Record<string, ArtifactReference[]>;
    history: Array<{ stepId: string; version: number; kind: 'completed' | 'approved' | 'revised' | 'paused' | 'resumed' | 'cancelled'; outputs?: ArtifactReference[]; actorId?: string; feedback?: string; channel?: string }>;
    decisions: Record<string, string>;
}
function stepOf(run: CircuitExecution) {
    const step = run.definition.steps.find(s => s.id === run.currentStepId);
    if (!step) throw new CircuitError('INVALID_EXECUTION');
    return step;
}
function enter(run: CircuitExecution) {
    const step=stepOf(run);
    run.status=['approval','selection'].includes(step.kind) ? 'waiting_approval' : 'ready';
}
function advance(run: CircuitExecution) {
    const index=run.definition.steps.findIndex(s=>s.id===run.currentStepId);
    const next=run.definition.steps[index+1];
    if (!next) {
        const production=run.definition.steps.filter(step=>step.kind!=='approval'&&step.kind!=='selection');
        if(!production.length||production.some(step=>!run.outputs[step.id]?.length))throw new CircuitError('DOSSIER_INCOMPLETE');
        run.status='ready_to_publish'; return;
    }
    run.currentStepId=next.id;enter(run);
}
export function startExecution(id: string, definition: CircuitDefinition, definitionVersion: number): CircuitExecution {
    const parsed=CircuitDefinitionSchema.parse(definition);
    const first=parsed.steps[0];
    if(!first)throw new CircuitError('EMPTY_CIRCUIT',400);
    const run: CircuitExecution={id,definition:parsed,definitionVersion,version:1,status:'ready',currentStepId:first.id,outputs:{},history:[],decisions:{}};
    enter(run);return run;
}
function assertCurrent(run: CircuitExecution, stepId: string, version: number) {
    if (run.version!==version || run.currentStepId!==stepId) throw new CircuitError('STALE_EXECUTION');
    if (['paused','cancelled','ready_to_publish'].includes(run.status)) throw new CircuitError('EXECUTION_NOT_ACTIVE');
}
export function completeStep(run: CircuitExecution, stepId: string, version: number, outputs: ArtifactReference[]): CircuitExecution {
    assertCurrent(run,stepId,version);
    if(run.status!=='ready')throw new CircuitError('STEP_NOT_READY');
    if(outputs.length<1 || outputs.length>32)throw new CircuitError('OUTPUT_REQUIRED',400);
    const parsed=outputs.map(output=>ArtifactReferenceSchema.parse(output));
    const kind=stepOf(run).kind;
    const required:Partial<Record<typeof kind,ArtifactReference['kind']>>={watch:'watch',writing:'article',visual_brief:'visual_prompt',generation:'image',control:'review'};
    const expected=required[kind];
    if(!expected || !parsed.some(ref=>ref.kind===expected) || parsed.some(ref=>ref.kind!==expected && !(kind==='watch'&&ref.kind==='subject')))throw new CircuitError('INVALID_STEP_OUTPUT',400);
    const next=structuredClone(run);
    Object.defineProperty(next.outputs,stepId,{value:parsed,enumerable:true,writable:true,configurable:true});
    next.history.push({stepId,version,kind:'completed',outputs:parsed});
    next.version++;advance(next);return next;
}
export function decideStep(run: CircuitExecution, input: CircuitDecision, actor: { id: string; kind: 'human' | 'bot' }): CircuitExecution {
    const decision=CircuitDecisionSchema.parse(input);
    const fingerprint=createHash('sha256').update(JSON.stringify({decision,actor})).digest('hex');
    const prior=run.decisions[decision.idempotencyKey];
    if(prior) {
        if(prior!==fingerprint)throw new CircuitError('IDEMPOTENCY_CONFLICT');
        return structuredClone(run);
    }
    assertCurrent(run,decision.stepId,decision.expectedVersion);
    const step=stepOf(run);
    if(run.status!=='waiting_approval')throw new CircuitError('APPROVAL_NOT_PENDING');
    if(step.assigneeId!==actor.id || step.validatorKind!==actor.kind)throw new CircuitError('NOT_ASSIGNED_APPROVER',403);
    const next=structuredClone(run);
    if(decision.choice==='revise') {
        const target=step.correctionStepId;
        if(!target || !decision.feedback)throw new CircuitError('CORRECTION_TARGET_AND_FEEDBACK_REQUIRED',400);
        const index=next.definition.steps.findIndex(s=>s.id===target);
        for(const invalidated of next.definition.steps.slice(index))delete next.outputs[invalidated.id];
        next.currentStepId=target;enter(next);
    } else {
        if(step.kind==='selection') {
            const selected=decision.selectedArtifact;
            if(!selected || selected.kind!=='subject')throw new CircuitError('SUBJECT_REQUIRED',400);
            const available=Object.values(run.outputs).flat().some(ref=>
                ref.id===selected.id && ref.version===selected.version && ref.sourceApp===selected.sourceApp && ref.canonicalUrl===selected.canonicalUrl && ref.kind==='subject');
            if(!available)throw new CircuitError('SUBJECT_NOT_IN_DOSSIER',400);
            Object.defineProperty(next.outputs,step.id,{value:[selected],enumerable:true,writable:true,configurable:true});
        } else if(decision.selectedArtifact)throw new CircuitError('UNEXPECTED_SUBJECT',400);
        advance(next);
    }
    next.history.push({stepId:step.id,version:run.version,kind:decision.choice==='approve'?'approved':'revised',actorId:actor.id,feedback:decision.feedback,channel:decision.channel});
    next.decisions[decision.idempotencyKey]=fingerprint;next.version++;return next;
}
export function controlExecution(run:CircuitExecution, action:'pause'|'resume'|'cancel', expectedVersion:number, actorId:string):CircuitExecution {
    if(run.version!==expectedVersion)throw new CircuitError('STALE_EXECUTION');
    if(run.status==='cancelled'||run.status==='ready_to_publish')throw new CircuitError('EXECUTION_TERMINAL');
    const next=structuredClone(run);
    if(action==='pause') {
        if(run.status==='paused')throw new CircuitError('ALREADY_PAUSED');
        next.suspendedStatus=run.status;next.status='paused';
    } else if(action==='resume') {
        if(run.status!=='paused'||!run.suspendedStatus)throw new CircuitError('NOT_PAUSED');
        next.status=run.suspendedStatus;delete next.suspendedStatus;
    } else { next.status='cancelled';delete next.suspendedStatus; }
    next.history.push({stepId:run.currentStepId,version:run.version,kind:action==='pause'?'paused':action==='resume'?'resumed':'cancelled',actorId});
    next.version++;return next;
}
/** UTC scan deliberately selects only the first occurrence of a repeated local time. */
export function nextOccurrences(input: CircuitSchedule, after: string, count=3): string[] {
    const schedule=CircuitScheduleSchema.parse(input);
    const start=Date.parse(after);
    if(!Number.isFinite(start) || !Number.isInteger(count) || count<1 || count>12)throw new CircuitError('INVALID_SCHEDULE_QUERY',400);
    const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:schedule.timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const results:string[]=[];const dates=new Set<string>();
    // Include the part of today's local date before `after` so a DST repeat is not retriggered.
    const end=start+(count+2)*8*86400000;
    for(let t=Math.floor((start-86400000)/60000)*60000;t<=end;t+=60000) {
        const parts=Object.fromEntries(formatter.formatToParts(t).map(p=>[p.type,p.value]));
        if(parts.weekday!==weekdays[schedule.weekday] || Number(parts.hour)!==schedule.hour || Number(parts.minute)!==schedule.minute)continue;
        const key=`${parts.year}-${parts.month}-${parts.day}`;
        if(dates.has(key))continue;dates.add(key);
        if(t<=start)continue;
        results.push(new Date(t).toISOString());if(results.length===count)return results;
    }
    throw new CircuitError('SCHEDULE_HORIZON_EXCEEDED',400);
}
