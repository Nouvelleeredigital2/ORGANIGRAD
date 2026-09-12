import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { dispatchEngineStep } from '../src/orchestration/engineDispatch.js';
import { CircuitAttemptError } from '../src/state/pgCircuitAttempts.js';

const key = {runId:'11111111-1111-4111-8111-111111111111', runVersion:1, stepId:'image'};
const input = {engineId:'flux', prompt:'Illustration du sujet validé'};
const digest = createHash('sha256').update(JSON.stringify([input.engineId,input.prompt])).digest('hex');
const jobId = '22222222-2222-4222-8222-222222222222';
function fixture() {
 const order:string[]=[];
 const receipt = {...key,payloadSha256:digest,status:'reserved' as const,leaseUntil:'2026-09-12T18:00:00Z',jobId:null};
 const attempts = {
  getReceipt:vi.fn().mockRejectedValue(new CircuitAttemptError('ATTEMPT_NOT_FOUND')),
  reserve:vi.fn().mockImplementation(async()=>{order.push('reserve');return {receipt,fencingToken:'owner'};}),
  markDispatched:vi.fn().mockImplementation(async()=>{order.push('dispatch');return {...receipt,status:'dispatched'};}),
  recordAcceptedJob:vi.fn().mockImplementation(async()=>{order.push('receipt');return {...receipt,status:'accepted',jobId};}),
  recoverExpired:vi.fn().mockResolvedValue({...receipt,status:'uncertain'}),
 };
 const engine = {submitOnce:vi.fn().mockImplementation(async()=>{order.push('submit');return {jobId,status:'queued',pipeline:['flux']};})};
 const authorize=vi.fn().mockImplementation(async()=>{order.push('authorize');});
 return {order,receipt,attempts,engine,authorize};
}
describe('persistent Engine dispatch',()=>{
 it('persists dispatch before submitting and the receipt before returning',async()=>{
  const f=fixture();
  expect(await dispatchEngineStep(key,input,f)).toEqual({jobId,reused:false});
  expect(f.order).toEqual(['authorize','reserve','authorize','dispatch','submit','receipt']);
  expect(f.attempts.reserve).toHaveBeenCalledWith({...key,payloadSha256:digest});
 });
 it('reuses the persisted job after restart without another submission',async()=>{
  const f=fixture();f.attempts.getReceipt.mockResolvedValue({...f.receipt,status:'accepted',jobId});
  expect(await dispatchEngineStep(key,input,f)).toEqual({jobId,reused:true});
  expect(f.engine.submitOnce).not.toHaveBeenCalled();
 });
 it('never resubmits a dispatched or uncertain attempt',async()=>{
  for(const status of ['dispatched','uncertain']){
   const f=fixture();f.attempts.getReceipt.mockResolvedValue({...f.receipt,status});
   await expect(dispatchEngineStep(key,input,f)).rejects.toThrow('DELIVERY_UNRESOLVED');
   expect(f.engine.submitOnce).not.toHaveBeenCalled();
  }
 });
 it('rejects a changed prompt under the same attempt',async()=>{
  const f=fixture();f.attempts.getReceipt.mockResolvedValue({...f.receipt,status:'accepted',jobId,payloadSha256:'other'});
  await expect(dispatchEngineStep(key,input,f)).rejects.toThrow('PAYLOAD_CONFLICT');
  expect(f.engine.submitOnce).not.toHaveBeenCalled();
 });
 it('checks revocation again after reserving',async()=>{
  const f=fixture();f.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('REVOKED'));
  await expect(dispatchEngineStep(key,input,f)).rejects.toThrow('REVOKED');
  expect(f.attempts.markDispatched).not.toHaveBeenCalled();
  expect(f.engine.submitOnce).not.toHaveBeenCalled();
 });
 it('does not turn a database outage into a new attempt',async()=>{
  const f=fixture();f.attempts.getReceipt.mockRejectedValue(new Error('DB_UNAVAILABLE'));
  await expect(dispatchEngineStep(key,input,f)).rejects.toThrow('DB_UNAVAILABLE');
  expect(f.attempts.reserve).not.toHaveBeenCalled();
 });
 it('does not claim success if the job receipt cannot be persisted',async()=>{
  const f=fixture();f.attempts.recordAcceptedJob.mockRejectedValue(new Error('DB_UNAVAILABLE'));
  await expect(dispatchEngineStep(key,input,f)).rejects.toThrow('RECEIPT_UNPERSISTED');
  expect(f.engine.submitOnce).toHaveBeenCalledTimes(1);
 });
});
