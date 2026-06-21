import type { FastifyInstance } from 'fastify';
import { IllegalTransitionError } from '../domain/stateMachine.js';
import { NodeNotFoundError } from '../state/graphStore.js';
import { toPublicNodeDTO } from './dto.js';
import type { ServerDeps } from './server.js';

/**
 * Routes REST + flux SSE.
 *
 * Codes HTTP imposés :
 *   - 200 succès
 *   - 404 nœud inconnu
 *   - 409 transition refusée par la machine à états (ex : approve sur un nœud non WAITING)
 */

export function registerRoutes(app: FastifyInstance, { store, engine }: ServerDeps): void {
    // --- GET /api/graph ----------------------------------------------------
    app.get('/api/graph', async () => {
        return { nodes: store.snapshot().map(toPublicNodeDTO) };
    });

    // --- POST /api/nodes/:id/run -------------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/run', async (req, reply) => {
        const { id } = req.params;
        try {
            const result = await engine.runNode(id);
            // Un échec d'exécution (MCP) n'est PAS un succès HTTP : le nœud est en
            // ERROR, on renvoie 502 avec le motif réel.
            if (!result.ok) {
                return reply.code(502).send({ ok: false, error: result.error });
            }
            return { ok: true };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/run-flow — exécute la chaîne depuis ce nœud ----
    app.post<{ Params: { id: string } }>('/api/nodes/:id/run-flow', async (req, reply) => {
        try {
            const result = await engine.runFlow(req.params.id);
            if (!result.ok) {
                return reply.code(502).send({ ok: false, stoppedAt: result.stoppedAt, error: result.error });
            }
            return { ok: true, waitingHumanAt: result.waitingHumanAt ?? null };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/approve ---------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/approve', async (req, reply) => {
        const { id } = req.params;
        try {
            await engine.approve(id);
            return { ok: true };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/reject ----------------------------------------
    app.post<{ Params: { id: string }; Body: { feedback?: string } }>(
        '/api/nodes/:id/reject',
        async (req, reply) => {
            const { id } = req.params;
            const feedback = req.body?.feedback ?? '';
            try {
                await engine.reject(id, feedback);
                return { ok: true };
            } catch (err) {
                return handleError(reply, err);
            }
        },
    );

    // --- POST /api/nodes/:id/reset -----------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/reset', async (req, reply) => {
        const { id } = req.params;
        try {
            await engine.reset(id);
            return { ok: true };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- GET /api/events (SSE) ---------------------------------------------
    app.get('/api/events', async (_req, reply) => {
        reply.raw.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
        });
        reply.raw.write(`: connected\n\n`);

        // Émet à chaque transition du store
        const off = store.onTransition((evt) => {
            const payload = {
                type: 'NODE_STATUS_CHANGED',
                nodeId: evt.nodeId,
                from: evt.from,
                to: evt.to,
                timestamp: new Date(evt.timestamp).toISOString(),
                payload: evt.payload ?? null,
            };
            reply.raw.write(`event: NODE_STATUS_CHANGED\n`);
            reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

        // Heartbeat 15 s pour maintenir la connexion vivante
        const heartbeat = setInterval(() => {
            reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        }, 15_000);

        _req.raw.on('close', () => {
            clearInterval(heartbeat);
            off();
        });

        // Empêche fastify de clôturer la requête : on tient le stream nous-mêmes
        return reply;
    });
}

function handleError(reply: import('fastify').FastifyReply, err: unknown) {
    if (err instanceof NodeNotFoundError) {
        return reply.code(404).send({ error: 'NODE_NOT_FOUND', nodeId: err.nodeId });
    }
    if (err instanceof IllegalTransitionError) {
        return reply.code(409).send({
            error: 'ILLEGAL_TRANSITION',
            from: err.from,
            to: err.to,
        });
    }
    return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
}
