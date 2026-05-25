import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Sql } from 'postgres';
import { McpClient } from '../mcp/mcpClient.js';
import { PgGraphStore } from '../state/pgGraphStore.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { IllegalTransitionError } from '../domain/stateMachine.js';
import { NodeNotFoundError } from '../state/pgGraphStore.js';
import { buildAuthHook } from './auth.js';
import { dispatchMcpRequest } from '../mcp/mcpServer.js';
import { Notifier, PgAuditLogger } from '../observability/notifier.js';

/**
 * Serveur HTTP de production — auth par clé API workspace, store Postgres.
 *
 * Toutes les routes sont authentifiées sauf `/healthz`. Chaque requête crée
 * un store + engine scopés au workspace de la clé.
 */

export interface PgNotifierConfig {
    validationsWebhook?: string;
    fluxWebhook?: string;
    appUrl?: string;
    /** Connexion SQL transmise pour créer un PgAuditLogger par workspace. */
    sqlForAudit?: Sql;
    /** URL de l'Edge Function notify-email. */
    emailEdgeFunctionUrl?: string;
    /** Clé service_role pour appeler l'Edge Function. */
    supabaseServiceRoleKey?: string;
}

export interface PgServerDeps {
    sql: Sql;
    mcpClient?: McpClient;
    notifierOptions?: PgNotifierConfig;
}

export function buildPgServer(deps: PgServerDeps): FastifyInstance {
    const app = Fastify({ logger: false });
    const mcp = deps.mcpClient ?? new McpClient({ timeoutMs: 30_000 });

    void app.register(cors, {
        origin: true,
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['authorization', 'content-type'],
    });

    app.get('/healthz', async () => ({ ok: true }));

    // Auth hook sur les routes /api/* ET /mcp
    const authHook = buildAuthHook({ sql: deps.sql });
    app.addHook('onRequest', async (req, reply) => {
        if (!req.url.startsWith('/api/') && !req.url.startsWith('/mcp')) return;
        await authHook(req, reply);
    });

    // --- POST /mcp — JSON-RPC 2.0 / Streamable HTTP (MCP) -----------------
    app.post('/mcp', async (req, reply) => {
        const body = req.body as unknown;
        const requests = Array.isArray(body)
            ? (body as Array<Record<string, unknown>>)
            : [body as Record<string, unknown>];

        const responses = await Promise.all(
            requests.map((r) =>
                dispatchMcpRequest(
                    r as never,
                    {
                        sql: deps.sql,
                        workspaceId: req.workspaceId!,
                        apiKeyId: req.apiKeyId,
                        mcpClient: mcp,
                    },
                ),
            ),
        );
        const filtered = responses.filter((r): r is NonNullable<typeof r> => r !== null);

        // Batch JSON-RPC : tableau si on a reçu un tableau
        if (Array.isArray(body)) return filtered;
        // Notification unique (pas de réponse) → 202 Accepted
        if (filtered.length === 0) return reply.code(202).send();
        return filtered[0];
    });

    /**
     * Crée un store scoped au workspace et y attache un Notifier si des webhooks
     * sont configurés. Le Notifier se détachera automatiquement lorsque le store
     * sera GC'd (aucun listener persistant côté Notifier après la requête).
     */
    const storeFor = (workspaceId: string, apiKeyId?: string) => {
        const store = new PgGraphStore(deps.sql, workspaceId, { kind: 'api_key', id: apiKeyId });
        const nc = deps.notifierOptions;
        if (nc && (nc.validationsWebhook || nc.fluxWebhook)) {
            const auditLogger = nc.sqlForAudit
                ? new PgAuditLogger(nc.sqlForAudit, workspaceId)
                : undefined;
            const notifier = new Notifier({
                store,
                validationsWebhook: nc.validationsWebhook,
                fluxWebhook: nc.fluxWebhook,
                appUrl: nc.appUrl,
                auditLogger,
                emailEdgeFunctionUrl: nc.emailEdgeFunctionUrl,
                supabaseServiceRoleKey: nc.supabaseServiceRoleKey,
            });
            notifier.attach();
        }
        return store;
    };

    // --- GET /api/graph -----------------------------------------------------
    app.get('/api/graph', async (req) => {
        const store = storeFor(req.workspaceId!, req.apiKeyId);
        const nodes = await store.list();
        return { nodes };
    });

    // --- POST /api/nodes/:id/run -------------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/run', async (req, reply) => {
        const store = storeFor(req.workspaceId!, req.apiKeyId);
        const engine = new OrchestrationEngine(store as never, mcp);
        try {
            await engine.runNode(req.params.id);
            return { ok: true };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/approve ---------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/approve', async (req, reply) => {
        const store = storeFor(req.workspaceId!, req.apiKeyId);
        try {
            await store.applyTransition(req.params.id, 'IDLE');
            return { ok: true };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/reject ----------------------------------------
    app.post<{ Params: { id: string }; Body: { feedback?: string } }>(
        '/api/nodes/:id/reject',
        async (req, reply) => {
            const store = storeFor(req.workspaceId!, req.apiKeyId);
            try {
                await store.applyTransition(req.params.id, 'ERROR', {
                    feedback: req.body?.feedback ?? '',
                });
                return { ok: true };
            } catch (err) {
                return handleError(reply, err);
            }
        },
    );

    // --- POST /api/nodes/:id/reset -----------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/reset', async (req, reply) => {
        const store = storeFor(req.workspaceId!, req.apiKeyId);
        try {
            await store.applyTransition(req.params.id, 'IDLE');
            return { ok: true };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- GET /api/events (SSE) ---------------------------------------------
    // SSE branché sur LISTEN/NOTIFY Postgres → toutes les transitions du workspace.
    app.get('/api/events', async (req, reply) => {
        reply.raw.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
        });
        reply.raw.write(': connected\n\n');

        const workspaceId = req.workspaceId!;
        let lastSeen = new Date().toISOString();

        // Polling 1.5s du journal — simple, fiable, pas de LISTEN/NOTIFY à câbler.
        // Pour usage à grande échelle, remplacer par pg_listen + trigger NOTIFY.
        const interval = setInterval(async () => {
            try {
                const rows = await deps.sql<
                    {
                        node_id: string;
                        from_status: string;
                        to_status: string;
                        payload: unknown;
                        created_at: string;
                    }[]
                >`
                    select node_id, from_status, to_status, payload, created_at
                      from public.node_transitions
                     where workspace_id = ${workspaceId} and created_at > ${lastSeen}
                     order by created_at asc
                     limit 50
                `;
                for (const r of rows) {
                    const event = {
                        type: 'NODE_STATUS_CHANGED',
                        nodeId: r.node_id,
                        from: r.from_status,
                        to: r.to_status,
                        timestamp: r.created_at,
                        payload: r.payload ?? null,
                    };
                    reply.raw.write('event: NODE_STATUS_CHANGED\n');
                    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
                    lastSeen = r.created_at;
                }
            } catch (err) {
                // Ne propage pas — la connexion SSE doit rester vivante
                console.warn('[sse] poll error', err);
            }
        }, 1500);

        const heartbeat = setInterval(() => {
            reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        }, 15_000);

        req.raw.on('close', () => {
            clearInterval(interval);
            clearInterval(heartbeat);
        });

        return reply;
    });

    return app;
}

function handleError(reply: import('fastify').FastifyReply, err: unknown) {
    if (err instanceof NodeNotFoundError) {
        return reply.code(404).send({ error: 'NODE_NOT_FOUND', nodeId: err.nodeId });
    }
    if (err instanceof IllegalTransitionError) {
        return reply.code(409).send({ error: 'ILLEGAL_TRANSITION', from: err.from, to: err.to });
    }
    return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
}
