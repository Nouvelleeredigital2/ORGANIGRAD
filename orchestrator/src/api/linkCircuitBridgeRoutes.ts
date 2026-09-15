import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { CircuitDecisionSchema } from '@apps2026/contracts';
import { CircuitError } from '../orchestration/circuits.js';
import { PgCircuitStore } from '../state/pgCircuitStore.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bodySchema=z.object({
    workspaceId:z.string().regex(UUID), runId:z.string().regex(UUID), actorId:z.string().regex(UUID),
    stepId:z.string().min(1).max(128), choice:z.enum(['approve','revise']), expectedVersion:z.number().int().positive(),
    idempotencyKey:z.string().regex(UUID), feedback:z.string().max(4000).optional(), selectedArtifact:z.unknown().optional(),
}).strict();

function authorized(request:FastifyRequest,expected:string):boolean {
    const header=request.headers.authorization;
    if(!header?.startsWith('Bearer '))return false;
    const presented=Buffer.from(header.slice(7));
    const configured=Buffer.from(expected);
    return presented.length===configured.length && timingSafeEqual(presented,configured);
}

/** LINK authenticates its user session before calling this server-only bridge.
 * The browser never supplies the channel or this token. */
export function registerLinkCircuitBridgeRoutes(app:FastifyInstance,deps:{sql:Sql;bridgeToken:string}) {
    app.post('/internal/link/circuit-decisions',async(request,reply)=>{
        if(!authorized(request,deps.bridgeToken))return reply.code(401).send({error:'LINK_BRIDGE_UNAUTHORIZED'});
        try {
            const body=bodySchema.parse(request.body);
            const decision=CircuitDecisionSchema.parse({
                stepId:body.stepId,choice:body.choice,expectedVersion:body.expectedVersion,idempotencyKey:body.idempotencyKey,
                feedback:body.feedback??'',selectedArtifact:body.selectedArtifact,channel:'link',
            });
            const run=await new PgCircuitStore(deps.sql,body.workspaceId).decide(body.runId,decision,{id:body.actorId,kind:'human'});
            return {run};
        } catch(error) {
            if(error instanceof CircuitError)return reply.code(error.status).send({error:error.code});
            if(error instanceof Error && error.name==='ZodError')return reply.code(400).send({error:'INVALID_LINK_DECISION'});
            request.log.error({errorType:error instanceof Error?error.name:'Unknown'},'LINK circuit decision failed');
            return reply.code(503).send({error:'CIRCUITS_UNAVAILABLE'});
        }
    });
}
