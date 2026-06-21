import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Sql } from 'postgres';
import { McpClient } from '../mcp/mcpClient.js';
import { PgGraphStore } from '../state/pgGraphStore.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { IllegalTransitionError } from '../domain/stateMachine.js';
import { NodeNotFoundError } from '../state/pgGraphStore.js';
import { buildAuthHook } from './auth.js';
import { assertScope, MissingScopeError, SCOPES } from './scopes.js';
import { toPublicNodeDTO } from './dto.js';
import { SseTicketStore } from './sseTickets.js';
import { PgAuditTrail } from '../observability/auditLog.js';
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
    /**
     * Allowlist CORS. Origines autorisées à appeler l'API depuis un navigateur.
     * Si absent, lue depuis `CORS_ALLOWED_ORIGINS` (séparées par des virgules).
     * Jamais de wildcard `*` : on renvoie l'origine seulement si elle matche.
     */
    allowedOrigins?: string[];
    /** Secret JWT Supabase (HS256) — active l'auth par session utilisateur. */
    jwtSecret?: string;
}

const PUBLIC_PATHS = new Set(['/healthz']);
/** Le flux SSE s'authentifie par ticket (query), pas par Bearer. */
function isSseStreamPath(url: string): boolean {
    return url.split('?')[0] === '/api/events';
}

export function buildPgServer(deps: PgServerDeps): FastifyInstance {
    const app = Fastify({ logger: false });
    const mcp = deps.mcpClient ?? new McpClient({ timeoutMs: 30_000 });
    const sseTickets = new SseTicketStore();
    const audit = new PgAuditTrail(deps.sql);

    // Journalise une action sensible (best-effort, n'échoue jamais le flux).
    const recordAudit = (
        req: import('fastify').FastifyRequest,
        action: string,
        resourceId: string | null,
        result: 'success' | 'denied' | 'error',
    ): void => {
        void audit.record({
            workspaceId: req.workspaceId ?? 'unknown',
            actorKind: req.userId ? 'user' : 'api_key',
            actorId: req.userId ?? req.apiKeyId ?? null,
            action,
            resourceType: 'node',
            resourceId,
            result,
            ip: req.ip ?? null,
            requestId: req.id ?? null,
        });
    };

    // Classe un échec en 'denied' (scope) ou 'error', pour l'audit.
    const auditResultOf = (err: unknown): 'denied' | 'error' =>
        err instanceof MissingScopeError ? 'denied' : 'error';

    const allowedOrigins =
        deps.allowedOrigins ??
        (process.env.CORS_ALLOWED_ORIGINS ?? '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);

    // CORS par allowlist explicite — jamais `*`. credentials activés seulement
    // si une allowlist est fournie (impossible avec une origine wildcard).
    void app.register(cors, {
        origin: (origin, cb) => {
            // Requêtes sans Origin (curl, server-to-server) : autorisées.
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(null, false);
        },
        credentials: allowedOrigins.length > 0,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['authorization', 'content-type'],
    });

    app.get('/healthz', async () => ({ ok: true }));

    // Auth hook par Bearer sur /api/* et /mcp — SAUF le flux SSE (ticket) et les
    // chemins publics.
    const authHook = buildAuthHook({ sql: deps.sql, jwtSecret: deps.jwtSecret });
    app.addHook('onRequest', async (req, reply) => {
        const path = req.url.split('?')[0]!;
        if (PUBLIC_PATHS.has(path)) return;
        if (isSseStreamPath(req.url)) return; // authentifié par ticket dans le handler
        if (!req.url.startsWith('/api/') && !req.url.startsWith('/mcp')) return;
        await authHook(req, reply);
    });

    // --- POST /api/events/ticket — émet un ticket SSE court à usage unique ----
    app.post('/api/events/ticket', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.executionRead);
            const ticket = sseTickets.issue({
                workspaceId: req.workspaceId!,
                apiKeyId: req.apiKeyId,
                scopes: req.scopes ?? [],
            });
            return { ticket, expiresInMs: 30_000 };
        } catch (err) {
            return handleError(reply, err);
        }
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
                    r,
                    {
                        sql: deps.sql,
                        workspaceId: req.workspaceId!,
                        apiKeyId: req.apiKeyId,
                        scopes: req.scopes,
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
        // Le notifier doit aussi s'attacher quand SEUL l'e-mail est configuré
        // (auparavant : attaché uniquement si un webhook Slack était présent).
        if (nc && (nc.validationsWebhook || nc.fluxWebhook || nc.emailEdgeFunctionUrl)) {
            const auditLogger = nc.sqlForAudit
                ? new PgAuditLogger(nc.sqlForAudit, workspaceId)
                : undefined;
            const notifier = new Notifier({
                store,
                workspaceId,
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
    app.get('/api/graph', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.graphRead);
            const store = storeFor(req.workspaceId!, req.apiKeyId);
            const nodes = await store.list();
            return { nodes: nodes.map(toPublicNodeDTO) };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/run -------------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/run', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.nodeRun);
            const store = storeFor(req.workspaceId!, req.apiKeyId);
            const engine = new OrchestrationEngine(store, mcp);
            await engine.runNode(req.params.id);
            recordAudit(req, 'node:run', req.params.id, 'success');
            return { ok: true };
        } catch (err) {
            recordAudit(req, 'node:run', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/approve ---------------------------------------
    // Validation HUMAINE : exige le scope human:approve, qu'une clé technique
    // ne peut pas obtenir (cf. create_workspace_api_key).
    app.post<{ Params: { id: string } }>('/api/nodes/:id/approve', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.humanApprove);
            const store = storeFor(req.workspaceId!, req.apiKeyId);
            await store.applyTransition(req.params.id, 'IDLE');
            recordAudit(req, 'human:approve', req.params.id, 'success');
            return { ok: true };
        } catch (err) {
            recordAudit(req, 'human:approve', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/reject ----------------------------------------
    app.post<{ Params: { id: string }; Body: { feedback?: string } }>(
        '/api/nodes/:id/reject',
        async (req, reply) => {
            try {
                assertScope(req.scopes, SCOPES.humanReject);
                const store = storeFor(req.workspaceId!, req.apiKeyId);
                await store.applyTransition(req.params.id, 'ERROR', {
                    feedback: req.body?.feedback ?? '',
                });
                recordAudit(req, 'human:reject', req.params.id, 'success');
                return { ok: true };
            } catch (err) {
                recordAudit(req, 'human:reject', req.params.id, auditResultOf(err));
                return handleError(reply, err);
            }
        },
    );

    // --- POST /api/nodes/:id/reset -----------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/reset', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.nodeReset);
            const store = storeFor(req.workspaceId!, req.apiKeyId);
            await store.applyTransition(req.params.id, 'IDLE');
            recordAudit(req, 'node:reset', req.params.id, 'success');
            return { ok: true };
        } catch (err) {
            recordAudit(req, 'node:reset', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- GET /api/events (SSE) ---------------------------------------------
    // SSE branché sur LISTEN/NOTIFY Postgres → toutes les transitions du workspace.
    app.get<{ Querystring: { ticket?: string } }>('/api/events', async (req, reply) => {
        // Authentification par TICKET court à usage unique (pas de clé permanente
        // dans l'URL). Le ticket porte le workspace et les scopes.
        const ticketData = sseTickets.consume(req.query?.ticket);
        if (!ticketData) {
            return reply.code(401).send({ error: 'INVALID_OR_EXPIRED_TICKET' });
        }
        if (!ticketData.scopes.includes(SCOPES.executionRead)) {
            return reply.code(403).send({ error: 'INSUFFICIENT_SCOPE', required: SCOPES.executionRead });
        }
        const workspaceId = ticketData.workspaceId;

        reply.raw.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
        });
        reply.raw.write(': connected\n\n');

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
    if (err instanceof MissingScopeError) {
        return reply.code(403).send({ error: 'INSUFFICIENT_SCOPE', required: err.required });
    }
    if (err instanceof NodeNotFoundError) {
        return reply.code(404).send({ error: 'NODE_NOT_FOUND', nodeId: err.nodeId });
    }
    if (err instanceof IllegalTransitionError) {
        return reply.code(409).send({ error: 'ILLEGAL_TRANSITION', from: err.from, to: err.to });
    }
    return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
}
