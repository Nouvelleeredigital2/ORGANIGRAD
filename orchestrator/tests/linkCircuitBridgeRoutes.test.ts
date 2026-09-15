import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerLinkCircuitBridgeRoutes } from '../src/api/linkCircuitBridgeRoutes.js';

const id='11111111-1111-4111-8111-111111111111';

it('refuse une décision LINK sans le secret du pont avant toute lecture SQL',async()=>{
 const app=Fastify();const sql=vi.fn();
 registerLinkCircuitBridgeRoutes(app,{sql:sql as never,bridgeToken:'secret-de-test'});
 const response=await app.inject({method:'POST',url:'/internal/link/circuit-decisions',payload:{workspaceId:id,runId:id,actorId:id,stepId:'selection',choice:'approve',expectedVersion:1,idempotencyKey:id}});
 expect(response.statusCode).toBe(401);
 expect(sql).not.toHaveBeenCalled();
 await app.close();
});

it('refuse un jeton incorrect sans révéler le canal interne',async()=>{
 const app=Fastify();const sql=vi.fn();
 registerLinkCircuitBridgeRoutes(app,{sql:sql as never,bridgeToken:'secret-de-test'});
 const response=await app.inject({method:'POST',url:'/internal/link/circuit-decisions',headers:{authorization:'Bearer autre-secret'},payload:{workspaceId:id,runId:id,actorId:id,stepId:'selection',choice:'approve',expectedVersion:1,idempotencyKey:id}});
 expect(response.statusCode).toBe(401);
 expect(response.json()).toEqual({error:'LINK_BRIDGE_UNAUTHORIZED'});
 expect(sql).not.toHaveBeenCalled();
 await app.close();
});
