import Fastify from 'fastify';
import { it,expect } from 'vitest';
import type { Sql } from 'postgres';
import { registerCircuitRoutes } from '../src/api/circuitRoutes.js';
const id='11111111-1111-4111-8111-111111111111';
it('réserve les autorisations de programmation aux administrateurs humains',async()=>{
 for(const role of [null,'member']) {
  const app=Fastify();let reads=0;
  app.addHook('onRequest',async req=>{req.workspaceId=id;if(role)req.userId=id;});
  registerCircuitRoutes(app,{sql:(async()=>{reads++;return [{role}];}) as unknown as Sql});
  const response=await app.inject({method:'POST',url:`/api/circuits/${id}/schedule-authorization`,payload:{idempotencyKey:id,expectedVersion:1,expiresAt:'2026-10-01T00:00:00Z'}});
  expect(response.statusCode).toBe(role?403:401);
  if(!role)expect(reads).toBe(0);
  await app.close();
 }
});
it('refuse une clé technique avant toute lecture SQL',async()=>{
 const app=Fastify();let calls=0;
 app.addHook('onRequest',async req=>{req.workspaceId=id;req.scopes=['graph:read'];});
 registerCircuitRoutes(app,{sql:(()=>{calls++;throw new Error('No SQL expected');}) as unknown as Sql});
 const response=await app.inject({url:'/api/circuits'});
 expect(response.statusCode).toBe(401);expect(calls).toBe(0);await app.close();
});
it('refuse un membre révoqué même si la requête porte encore les scopes',async()=>{
 const app=Fastify();
 app.addHook('onRequest',async req=>{req.workspaceId=id;req.userId=id;req.scopes=['graph:read'];});
 registerCircuitRoutes(app,{sql:(async()=>[]) as unknown as Sql});
 const response=await app.inject({url:'/api/circuits'});expect(response.statusCode).toBe(403);await app.close();
});
it('refuse une décision Telegram forgée dans la route humaine',async()=>{
 const app=Fastify();
 app.addHook('onRequest',async req=>{req.workspaceId=id;req.userId=id;req.scopes=['human:approve'];});
 registerCircuitRoutes(app,{sql:(async()=>[{role:'member'}]) as unknown as Sql});
 const response=await app.inject({method:'POST',url:`/api/circuit-runs/${id}/decisions`,payload:{stepId:'final',choice:'approve',expectedVersion:1,idempotencyKey:id,channel:'telegram'}});
 expect(response.statusCode).toBe(400);await app.close();
});
