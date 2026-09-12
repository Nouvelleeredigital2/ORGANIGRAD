import { createHash } from 'node:crypto';
import { CircuitAttemptError, type CircuitAttemptKey, type PgCircuitAttempts } from '../state/pgCircuitAttempts.js';
import type { EngineImageInput, EngineSubmittedJob } from '../integrations/engineTaskClient.js';

export class EngineDispatchError extends Error {
 constructor(readonly code: 'PAYLOAD_CONFLICT'|'DELIVERY_UNRESOLVED'|'RECEIPT_UNPERSISTED'|'INVALID_INPUT', readonly jobId?:string) {
  super(code); this.name='EngineDispatchError';
 }
}
type AttemptStore=Pick<PgCircuitAttempts,'getReceipt'|'reserve'|'markDispatched'|'recordAcceptedJob'|'recoverExpired'>;

/** Internal executor boundary. The caller binds the store to the verified workspace
 * and authorize to this run's project, assignment and current service grant.
 * A restart never retries a POST whose receipt is unknown. No personal JWT,
 * scheduler activation or production credential discovery happens here. */
export async function dispatchEngineStep(
 key:CircuitAttemptKey,
 input:EngineImageInput,
 deps:{attempts:AttemptStore;engine:{submitOnce(id:string,input:EngineImageInput):Promise<EngineSubmittedJob>};authorize(key:CircuitAttemptKey):Promise<void>},
):Promise<{jobId:string;reused:boolean}> {
 if(!input || typeof input.engineId!=='string' || !/^[a-z][a-z0-9-]{0,63}$/.test(input.engineId) ||
    typeof input.prompt!=='string' || !input.prompt.trim() || input.prompt.length>20000)throw new EngineDispatchError('INVALID_INPUT');
 await deps.authorize(key);
 const payloadSha256=createHash('sha256').update(JSON.stringify([input.engineId,input.prompt])).digest('hex');
 let prior;
 try { prior=await deps.attempts.getReceipt(key); }
 catch(error) { if(!(error instanceof CircuitAttemptError) || error.code!=='ATTEMPT_NOT_FOUND')throw error; }
 if(prior) {
  if(prior.payloadSha256!==payloadSha256)throw new EngineDispatchError('PAYLOAD_CONFLICT');
  if(prior.status==='accepted' && prior.jobId)return {jobId:prior.jobId,reused:true};
  if(prior.status!=='reserved') {
   const recovered=await deps.attempts.recoverExpired(key);
   if(recovered.payloadSha256!==payloadSha256)throw new EngineDispatchError('PAYLOAD_CONFLICT');
   if(recovered.status==='accepted' && recovered.jobId)return {jobId:recovered.jobId,reused:true};
   throw new EngineDispatchError('DELIVERY_UNRESOLVED');
  }
 }
 const reservation=await deps.attempts.reserve({...key,payloadSha256});
 await deps.authorize(key);
 const owner={...key,fencingToken:reservation.fencingToken};
 await deps.attempts.markDispatched(owner);
 // Once dispatched, *any* failure must leave the durable barrier in place.
 const submitted=await deps.engine.submitOnce(reservation.fencingToken,input);
 try {await deps.attempts.recordAcceptedJob(owner,submitted.jobId);}
 catch {throw new EngineDispatchError('RECEIPT_UNPERSISTED',submitted.jobId);}
 return {jobId:submitted.jobId,reused:false};
}
