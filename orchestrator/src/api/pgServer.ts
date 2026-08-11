import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Sql } from 'postgres';
import { McpClient } from '../mcp/mcpClient.js';
import { PgGraphStore } from '../state/pgGraphStore.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { createSynapseProducer } from '../synapse/producer.js';
import { IllegalTransitionError } from '../domain/stateMachine.js';
import { NodeNotFoundError } from '../state/pgGraphStore.js';
import { buildAuthHook } from './auth.js';
import type { UserTokenVerifier } from './userAuth.js';
import { assertScope, MissingScopeError, SCOPES } from './scopes.js';
import { toPublicNodeDTO, validateNodeMutation, NodeMutationValidationError } from './dto.js';
import { SecretCipher } from '../security/crypto.js';
import { SseTicketStore } from './sseTickets.js';
import { PgAuditTrail } from '../observability/auditLog.js';
import { dispatchMcpRequest } from '../mcp/mcpServer.js';
import { Notifier, PgAuditLogger } from '../observability/notifier.js';
import { safeFetch } from '../net/ssrfGuard.js';
import type { HybridNode } from '../domain/types.js';

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
    /**
     * Vérificateur de session complet (HS256 et/ou ES256 via JWKS) — voir
     * `createSupabaseJwtVerifier`. Prioritaire sur `jwtSecret`.
     */
    verifyUserToken?: UserTokenVerifier;
    /** Base URL de l'API LINK — active POST /api/integrations/link/import si présente avec linkBridgeToken. */
    linkBaseUrl?: string;
    /** Token Bearer du pont LINK (GET /api/bridge/agents). */
    linkBridgeToken?: string;
    /** fetch injectable pour les tests (défaut : safeFetch réel). */
    fetchImpl?: typeof fetch;
    /** Résolution DNS injectable pour les tests de safeFetch (défaut : DNS réel). */
    fetchLookup?: import('../net/ssrfGuard.js').SafeFetchDeps['lookup'];
}

const PUBLIC_PATHS = new Set(['/healthz']);
/** Le flux SSE s'authentifie par ticket (query), pas par Bearer. */
function isSseStreamPath(url: string): boolean {
    return url.split('?')[0] === '/api/events';
}

export function buildPgServer(deps: PgServerDeps): FastifyInstance {
    const app = Fastify({ logger: false });
    const mcp = deps.mcpClient ?? new McpClient({ timeoutMs: 30_000 });
    // Producteur de bus APPS-2026 (hop 1 + hop 5). Auto-inactif sans SYNAPSE_URL.
    const synapseProducer = createSynapseProducer({ appUrl: deps.notifierOptions?.appUrl });
    const sseTickets = new SseTicketStore();
    const audit = new PgAuditTrail(deps.sql);

    // Chiffrement au repos — optionnel (si la clé n'est pas configurée, les
    // nœuds sont stockés en clair et restent lisibles, rétro-compatible).
    let _cipher: SecretCipher | null | undefined;
    const getCipher = (): SecretCipher | null => {
        if (_cipher !== undefined) return _cipher;
        try {
            _cipher = SecretCipher.fromEnv();
        } catch {
            _cipher = null;
        }
        return _cipher;
    };

    // Journalise une action sensible (best-effort, n'échoue jamais le flux).
    // `.catch()` explicite obligatoire : `void promise` ne rattrape RIEN, ce
    // n'est qu'une annotation « je n'attends pas ce résultat ». `PgAuditTrail`
    // attrape déjà ses propres erreurs, mais un rejet non rattrapé ici (toute
    // implémentation d'`AuditTrail` future, ou un throw synchrone) fait
    // planter tout le process Node (unhandled rejection) — constaté en
    // recette le 2026-08-09 après une erreur SQL en cascade.
    const recordAudit = (
        req: import('fastify').FastifyRequest,
        action: string,
        resourceId: string | null,
        result: 'success' | 'denied' | 'error',
    ): void => {
        audit
            .record({
                workspaceId: req.workspaceId ?? 'unknown',
                actorKind: req.userId ? 'user' : 'api_key',
                actorId: req.userId ?? req.apiKeyId ?? null,
                action,
                resourceType: 'node',
                resourceId,
                result,
                ip: req.ip ?? null,
                requestId: req.id ?? null,
            })
            .catch((err) => {
                console.warn('[audit] échec écriture du journal (rattrapé)', {
                    action,
                    error: err instanceof Error ? err.message : String(err),
                });
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
        allowedHeaders: ['authorization', 'content-type', 'x-workspace-id'],
    });

    app.get('/healthz', async () => ({ ok: true }));

    // Auth hook par Bearer sur /api/* et /mcp — SAUF le flux SSE (ticket) et les
    // chemins publics.
    const authHook = buildAuthHook({
        sql: deps.sql,
        jwtSecret: deps.jwtSecret,
        verifyUserToken: deps.verifyUserToken,
    });
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

        // Borne la taille du batch (anti-abus : Promise.all non borné sinon).
        const MAX_MCP_BATCH = 20;
        if (requests.length > MAX_MCP_BATCH) {
            return reply.code(413).send({ error: 'BATCH_TOO_LARGE', max: MAX_MCP_BATCH });
        }

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
    const storeFor = (workspaceId: string, apiKeyId?: string, userId?: string) => {
        // Acteur RÉEL pour le journal des transitions : utilisateur (session JWT)
        // si présent, sinon clé API technique (corrige l'identité d'audit).
        const actor = userId
            ? ({ kind: 'user', id: userId } as const)
            : ({ kind: 'api_key', id: apiKeyId } as const);
        const store = new PgGraphStore(deps.sql, workspaceId, actor, getCipher());
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

    // --- POST /api/integrations/link/import ---------------------------------
    // Importe les bots/personas Hermes exposés par LINK (GET /api/bridge/agents)
    // comme des nœuds AGENT_IA, référencés par leur id LINK (uuid5 stable) — pas
    // de copie de prompt ni de capacités (B3). Idempotent : ré-exécutable, upsert
    // par id. Réservé aux admins de workspace (session humaine uniquement — une
    // clé API technique n'a jamais workspace:admin, cf. scopes.ts).
    interface LinkBridgeAgent {
        id: string;
        name: string;
        title: string | null;
        network: string;
        role: string;
        channel: string | null;
        enabled: boolean;
    }
    app.post('/api/integrations/link/import', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.workspaceAdmin);
            if (!deps.linkBaseUrl || !deps.linkBridgeToken) {
                return reply.code(503).send({ error: 'LINK_BRIDGE_NOT_CONFIGURED' });
            }

            const url = new URL('/api/bridge/agents', deps.linkBaseUrl).toString();
            let res: Response;
            try {
                res = await safeFetch(
                    url,
                    { headers: { authorization: `Bearer ${deps.linkBridgeToken}` } },
                    {},
                    { fetchImpl: deps.fetchImpl, lookup: deps.fetchLookup },
                );
            } catch {
                return reply.code(502).send({ error: 'LINK_BRIDGE_UNREACHABLE' });
            }
            if (!res.ok) {
                return reply.code(502).send({ error: 'LINK_BRIDGE_ERROR', status: res.status });
            }

            const body = (await res.json()) as { agents?: LinkBridgeAgent[] };
            const agents = Array.isArray(body.agents) ? body.agents : [];

            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            let created = 0;
            let updated = 0;
            for (const agent of agents) {
                if (!agent.enabled) continue;
                const existed = await store.has(agent.id);
                const node: HybridNode = {
                    id: agent.id,
                    type: 'AGENT_IA',
                    nom: agent.name,
                    roleTitre: agent.title ?? agent.role,
                    parentID: null,
                    gradeId: 'Agent',
                    skills: [agent.network, agent.role].filter((s): s is string => Boolean(s)),
                    notificationChannels: agent.channel?.startsWith('telegram')
                        ? { telegram: agent.channel }
                        : undefined,
                    status: 'IDLE',
                };
                await store.upsertNode(node);
                await deps.sql`
                    update public.hybrid_nodes set external_app = 'link'
                     where id = ${agent.id} and workspace_id = ${req.workspaceId!}
                `;
                if (existed) updated += 1;
                else created += 1;
            }

            recordAudit(req, 'link:import_agents', null, 'success');
            return { ok: true, created, updated, skipped: agents.length - created - updated, total: agents.length };
        } catch (err) {
            recordAudit(req, 'link:import_agents', null, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- GET /api/graph -----------------------------------------------------
    app.get('/api/graph', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.graphRead);
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            const nodes = await store.list();
            return { nodes: nodes.map(toPublicNodeDTO) };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- GET /api/nodes/:id — lecture complète déchiffrée (pour l'édition) ---
    // Exige graph:write : seuls les humains autorisés à écrire peuvent lire les secrets.
    app.get<{ Params: { id: string } }>('/api/nodes/:id', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.graphWrite);
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            const node = await store.get(req.params.id);
            return { node };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes — création d'un nœud (chiffrement auto si clé présente) ---
    app.post<{ Body: unknown }>('/api/nodes', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.graphWrite);
            const body = validateNodeMutation(req.body);
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            const nodePayload = {
                ...body,
                parentID: body.parentID ?? null,
                systemPrompt: body.systemPrompt ?? undefined,
                mcpConfig: body.mcpConfig ?? undefined,
                notificationChannels: body.notificationChannels ?? undefined,
                avatarUrl: body.avatarUrl ?? undefined,
                status: 'IDLE' as const,
            };
            const node = await store.upsertNode(nodePayload);
            recordAudit(req, 'graph:create', node.id, 'success');
            return reply.code(201).send({ node: toPublicNodeDTO(node) });
        } catch (err) {
            recordAudit(req, 'graph:create', null, auditResultOf(err));
            if (err instanceof NodeMutationValidationError) {
                return reply.code(400).send({ error: 'VALIDATION_ERROR', field: err.field, message: err.message });
            }
            return handleError(reply, err);
        }
    });

    // --- PUT /api/nodes/:id — mise à jour d'un nœud existant ------------------
    app.put<{ Params: { id: string }; Body: unknown }>('/api/nodes/:id', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.graphWrite);
            const body = validateNodeMutation({ ...(req.body as object), id: req.params.id });
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            // Préserve le statut actuel (les mutations structurelles ne changent pas le statut).
            const existing = await store.get(req.params.id);
            // Champs sensibles : propriété absente ⇒ on reprend la valeur
            // existante (déjà déchiffrée par le store), elle sera rechiffrée
            // à l'écriture. `null` explicite ⇒ effacement demandé.
            // Sans cela, un client qui ne peut pas lire un secret chiffré
            // l'effacerait à chaque enregistrement.
            const updatePayload = {
                ...body,
                parentID: body.parentID ?? null,
                systemPrompt:
                    body.systemPrompt === undefined ? existing.systemPrompt : (body.systemPrompt ?? undefined),
                mcpConfig: body.mcpConfig === undefined ? existing.mcpConfig : (body.mcpConfig ?? undefined),
                notificationChannels:
                    body.notificationChannels === undefined
                        ? existing.notificationChannels
                        : (body.notificationChannels ?? undefined),
                avatarUrl: body.avatarUrl ?? undefined,
                status: existing.status,
            };
            const node = await store.upsertNode(updatePayload);
            recordAudit(req, 'graph:update', node.id, 'success');
            return { node: toPublicNodeDTO(node) };
        } catch (err) {
            recordAudit(req, 'graph:update', req.params.id, auditResultOf(err));
            if (err instanceof NodeMutationValidationError) {
                return reply.code(400).send({ error: 'VALIDATION_ERROR', field: err.field, message: err.message });
            }
            return handleError(reply, err);
        }
    });

    // --- DELETE /api/nodes/:id — suppression d'un nœud ------------------------
    app.delete<{ Params: { id: string } }>('/api/nodes/:id', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.graphWrite);
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            await store.deleteNode(req.params.id);
            recordAudit(req, 'graph:delete', req.params.id, 'success');
            return reply.code(204).send();
        } catch (err) {
            recordAudit(req, 'graph:delete', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/run -------------------------------------------
    app.post<{ Params: { id: string } }>('/api/nodes/:id/run', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.nodeRun);
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            const engine = new OrchestrationEngine(store, mcp, synapseProducer);
            const result = await engine.runNode(req.params.id);
            if (!result.ok) {
                // Échec MCP : le nœud est en ERROR. On rapporte l'échec réel.
                recordAudit(req, 'node:run', req.params.id, 'error');
                return reply.code(502).send({ ok: false, error: result.error });
            }
            recordAudit(req, 'node:run', req.params.id, 'success');
            return { ok: true };
        } catch (err) {
            recordAudit(req, 'node:run', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/run-flow — exécute la CHAÎNE depuis ce nœud -----
    app.post<{ Params: { id: string } }>('/api/nodes/:id/run-flow', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.nodeRun);
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            const engine = new OrchestrationEngine(store, mcp, synapseProducer);
            const result = await engine.runFlow(req.params.id);
            if (!result.ok) {
                recordAudit(req, 'flow:run', req.params.id, 'error');
                return reply.code(502).send({ ok: false, stoppedAt: result.stoppedAt, error: result.error });
            }
            recordAudit(req, 'flow:run', req.params.id, 'success');
            return { ok: true, waitingHumanAt: result.waitingHumanAt ?? null };
        } catch (err) {
            recordAudit(req, 'flow:run', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- POST /api/nodes/:id/approve ---------------------------------------
    // Validation HUMAINE : exige le scope human:approve, qu'une clé technique
    // ne peut pas obtenir (cf. create_workspace_api_key). Après approbation, le
    // flux REPREND automatiquement à partir de l'aval.
    app.post<{ Params: { id: string } }>('/api/nodes/:id/approve', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.humanApprove);
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            await store.applyTransition(req.params.id, 'IDLE');
            recordAudit(req, 'human:approve', req.params.id, 'success');
            // Hop 5 — annonce la décision officielle sur le bus (best-effort).
            // Enveloppé dans try/catch : une panne Synapse ne doit jamais échouer la réponse HTTP.
            try {
                await synapseProducer.onDecision?.(req.params.id, 'approved', undefined, {
                    decidedBy: req.userId ?? req.apiKeyId ?? undefined,
                    title: await nodeTitleOf(store, req.params.id),
                });
            } catch (synapseErr) {
                console.warn('[approve] Synapse onDecision failed (best-effort)', synapseErr);
            }
            // Reprise du workflow après validation humaine (best-effort : un échec
            // de reprise n'invalide pas l'approbation déjà persistée).
            let resume: Awaited<ReturnType<OrchestrationEngine['resumeFromChildOf']>> = null;
            try {
                const engine = new OrchestrationEngine(store, mcp, synapseProducer);
                resume = await engine.resumeFromChildOf(req.params.id);
            } catch (resumeErr) {
                recordAudit(req, 'flow:resume', req.params.id, 'error');
                console.warn('[approve] reprise du flux échouée', resumeErr);
            }
            return { ok: true, resumed: resume !== null, waitingHumanAt: resume?.waitingHumanAt ?? null };
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
                const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
                await store.applyTransition(req.params.id, 'ERROR', {
                    feedback: req.body?.feedback ?? '',
                });
                recordAudit(req, 'human:reject', req.params.id, 'success');
                // Hop 5 — annonce le rejet officiel sur le bus (best-effort).
                // Enveloppé dans try/catch : une panne Synapse ne doit jamais échouer la réponse HTTP.
                try {
                    await synapseProducer.onDecision?.(req.params.id, 'rejected', req.body?.feedback ?? '', {
                        decidedBy: req.userId ?? req.apiKeyId ?? undefined,
                        title: await nodeTitleOf(store, req.params.id),
                    });
                } catch (synapseErr) {
                    console.warn('[reject] Synapse onDecision failed (best-effort)', synapseErr);
                }
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
            const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
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

/**
 * Titre lisible d'un nœud pour le payload de décision Synapse (contrat annuaire :
 * « titre/résumé si dispo »). Best-effort : ne lève jamais — `undefined` si le
 * nœud est introuvable ou si le store échoue (l'émission reste valide sans titre).
 */
async function nodeTitleOf(
    store: { get(id: string): Promise<{ nom?: string; roleTitre?: string }> },
    nodeId: string,
): Promise<string | undefined> {
    try {
        const node = await store.get(nodeId);
        return node.nom ?? node.roleTitre ?? undefined;
    } catch {
        return undefined;
    }
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
