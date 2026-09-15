import { describe, expect, it, vi } from 'vitest';
import type { ArtifactReference } from '@apps2026/contracts';
import { startExecution } from '../src/orchestration/circuits.js';
import { executeBorealExternalStep, ExternalDeliveryUncertain, EngineUnavailable } from '../src/orchestration/borealExternalExecutor.js';

const ids={workspace:'11111111-1111-4111-8111-111111111111',project:'22222222-2222-4222-8222-222222222222',eric:'33333333-3333-4333-8333-333333333333',design:'44444444-4444-4444-8444-444444444444',engine:'55555555-5555-4555-8555-555555555555',guardian:'66666666-6666-4666-8666-666666666666',human:'77777777-7777-4777-8777-777777777777'};
const project={sourceApp:'organigrad' as const,workspaceId:ids.workspace,projectId:ids.project,canonicalUrl:'https://organigrad.example.test/projects/boreal'};
const reference=(kind:ArtifactReference['kind']):ArtifactReference=>({sourceApp:'atelier-orvion',id:'88888888-8888-4888-8888-888888888888',kind,version:1,canonicalUrl:'https://orvion.example.test/boards/boreal/editorial'});
const run=()=>startExecution('99999999-9999-4999-8999-999999999999',{name:'Atelier',project,schedule:null,steps:[{id:'veille',kind:'watch',assigneeId:ids.eric,validatorKind:'bot',instructions:'veille'},{id:'validation',kind:'approval',assigneeId:ids.human,validatorKind:'human',instructions:'valider',correctionStepId:'veille'}]},1);
const receipt=()=>({reserve:vi.fn().mockResolvedValue({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'reserved'}),accept:vi.fn().mockResolvedValue(undefined),markUncertain:vi.fn().mockResolvedValue(undefined)});

describe('Boreal external executor',()=>{
 it('reserves the receipt before creating the sourced watch and accepts its verified reference',async()=>{
  const receipts=receipt(),service={execute:vi.fn().mockResolvedValue(reference('watch'))};
  const result=await executeBorealExternalStep(run(),{mandateId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',receipts,service});
  expect(receipts.reserve).toHaveBeenCalledBefore(service.execute as never);
  expect(receipts.accept).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',reference('watch'));
  expect(result).toEqual({kind:'completed',outputs:[reference('watch')]});
 });
 it('marks a receipt uncertain after a lost external answer and never reports completion',async()=>{
  const receipts=receipt(),service={execute:vi.fn().mockRejectedValue(new ExternalDeliveryUncertain())};
  await expect(executeBorealExternalStep(run(),{mandateId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',receipts,service})).rejects.toThrow('EXTERNAL_DELIVERY_UNCERTAIN');
  expect(receipts.markUncertain).toHaveBeenCalledWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(receipts.accept).not.toHaveBeenCalled();
 });
 it('leaves generation waiting for Engine without inventing an image',async()=>{
  const generation={...startExecution('99999999-9999-4999-8999-999999999999',{name:'Atelier',project,schedule:null,steps:[{id:'generation',kind:'generation',assigneeId:ids.engine,validatorKind:'bot',instructions:'image'},{id:'validation',kind:'approval',assigneeId:ids.human,validatorKind:'human',instructions:'valider',correctionStepId:'generation'}]},1),outputs:{brief:[reference('visual_prompt')]}};
  const receipts=receipt(),service={execute:vi.fn().mockRejectedValue(new EngineUnavailable())};
  const result=await executeBorealExternalStep(generation,{mandateId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',receipts,service});
  expect(result).toEqual({kind:'waiting_engine'});
  expect(receipts.accept).not.toHaveBeenCalled();
  expect(receipts.markUncertain).not.toHaveBeenCalled();
 });
});
