import { describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { PgCircuitReceipts } from '../src/state/pgCircuitReceipts.js';

const ids={workspace:'11111111-1111-4111-8111-111111111111',run:'22222222-2222-4222-8222-222222222222',receipt:'33333333-3333-4333-8333-333333333333',mandate:'44444444-4444-4444-8444-444444444444',key:'55555555-5555-4555-8555-555555555555'};
const project={sourceApp:'organigrad' as const,workspaceId:ids.workspace,projectId:'66666666-6666-4666-8666-666666666666',canonicalUrl:'https://organigrad.example.test/projects/boreal'};
const artifact={sourceApp:'atelier-orvion' as const,id:'77777777-7777-4777-8777-777777777777',kind:'watch' as const,version:1,canonicalUrl:'https://orvion.example.test/boards/boreal/watch'};

function sqlFixture() {
 const execute=vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.join('?');
  if(query.includes('circuit_receipt_reserve'))return [{receipt:{id:ids.receipt,status:'reserved'}}];
  if(query.includes('circuit_receipt_accept'))return [{receipt:{id:ids.receipt,status:'accepted',reference:artifact}}];
  if(query.includes('circuit_receipt_mark_uncertain'))return [{receipt:{id:ids.receipt,status:'uncertain'}}];
  throw new Error(`Unexpected SQL: ${query}`);
 });
 return {sql:Object.assign(execute,{json:JSON.stringify}) as unknown as Sql,execute};
}

describe('PgCircuitReceipts',()=>{
 it('uses the receipt RPCs rather than granting direct table access',async()=>{
  const fixture=sqlFixture(),receipts=new PgCircuitReceipts(fixture.sql);
  const reserved=await receipts.reserve({workspaceId:ids.workspace,runId:ids.run,runVersion:1,stepId:'watch',project,idempotencyKey:ids.key,payloadSha256:'a'.repeat(64),mandateId:ids.mandate});
  await receipts.accept(reserved.id,artifact);
  await receipts.markUncertain(reserved.id);
  expect(fixture.execute.mock.calls.map(([strings])=>(strings as TemplateStringsArray).join('?'))).toEqual(expect.arrayContaining([
   expect.stringContaining('circuit_receipt_reserve'),expect.stringContaining('circuit_receipt_accept'),expect.stringContaining('circuit_receipt_mark_uncertain'),
  ]));
 });
});