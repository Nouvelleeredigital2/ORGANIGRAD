import { describe, expect, it, vi } from 'vitest';
import type { CircuitExecution } from '../src/orchestration/circuits.js';
import { PgBorealExecutor } from '../src/orchestration/pgBorealExecutor.js';

const run: CircuitExecution={
 id:'11111111-1111-4111-8111-111111111111',version:4,status:'ready',currentStepId:'watch',outputs:{},history:[],decisions:{},definitionVersion:1,
 definition:{name:'Atelier Boréal',schedule:null,project:{sourceApp:'organigrad',workspaceId:'22222222-2222-4222-8222-222222222222',projectId:'33333333-3333-4333-8333-333333333333',canonicalUrl:'https://organigrad.example.test/projects/boreal'},steps:[{id:'watch',kind:'watch',assigneeId:'44444444-4444-4444-8444-444444444444',validatorKind:'bot',instructions:'Veille'},{id:'final',kind:'approval',assigneeId:'55555555-5555-4555-8555-555555555555',validatorKind:'human',instructions:'Valider',correctionStepId:'watch'}]},
};
const artifact={sourceApp:'atelier-orvion' as const,id:'66666666-6666-4666-8666-666666666666',kind:'watch' as const,version:1,canonicalUrl:'https://orvion.example.test/boards/boreal/watch'};

describe('PgBorealExecutor',()=>{
 it('persists the circuit transition only after its external receipt is accepted',async()=>{
  const store={getRun:vi.fn().mockResolvedValue(run),completeExternal:vi.fn().mockResolvedValue({...run,version:5,status:'waiting_approval'}),waitForEngine:vi.fn()};
  const receipts={reserve:vi.fn().mockResolvedValue({id:'77777777-7777-4777-8777-777777777777',status:'reserved'}),accept:vi.fn().mockResolvedValue(undefined),markUncertain:vi.fn().mockResolvedValue(undefined)};
  const service={execute:vi.fn().mockResolvedValue(artifact)};
  const executor=new PgBorealExecutor(store,receipts,service,'88888888-8888-4888-8888-888888888888');
  const completed=await executor.execute(run.id);
  expect(receipts.accept).toHaveBeenCalled();
  expect(store.completeExternal).toHaveBeenCalledWith(run.id,{stepId:'watch',expectedVersion:4,outputs:[artifact]});
  expect(completed.version).toBe(5);
 });
});
it('persists waiting_engine after Engine declines submission and never completes the step',async()=>{
 const generation={...run,currentStepId:'generation',definition:{...run.definition,steps:[{id:'generation',kind:'generation' as const,assigneeId:'44444444-4444-4444-8444-444444444444',validatorKind:'bot',instructions:'Image'},{id:'final',kind:'approval' as const,assigneeId:'55555555-5555-4555-8555-555555555555',validatorKind:'human' as const,instructions:'Valider',correctionStepId:'generation'}]},outputs:{brief:[{...artifact,kind:'visual_prompt' as const}]}};
 const store={getRun:vi.fn().mockResolvedValue(generation),completeExternal:vi.fn(),waitForEngine:vi.fn().mockResolvedValue({...generation,version:5,status:'waiting_engine'})};
 const receipts={reserve:vi.fn().mockResolvedValue({id:'77777777-7777-4777-8777-777777777777',status:'reserved'}),accept:vi.fn(),markUncertain:vi.fn()};
 const { EngineUnavailable }=await import('../src/orchestration/borealExternalExecutor.js');
 const executor=new PgBorealExecutor(store,receipts,{execute:vi.fn().mockRejectedValue(new EngineUnavailable())},'88888888-8888-4888-8888-888888888888');
 const waiting=await executor.execute(generation.id);
 expect(store.waitForEngine).toHaveBeenCalledWith(generation.id,{stepId:'generation',expectedVersion:4});
 expect(store.completeExternal).not.toHaveBeenCalled();
 expect(waiting.status).toBe('waiting_engine');
});
