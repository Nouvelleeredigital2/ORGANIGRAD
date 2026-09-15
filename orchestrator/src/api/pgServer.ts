import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Sql } from 'postgres';
import { McpClient } from '../mcp/mcpClient.js';
import { PgGraphStore } from '../state/pgGraphStore.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { createSynapseProducer } from '../synapse/producer.js';
import { IllegalTransitionError } from '../domain/stateMachine.js';
import { NodeNotFoundError, OptimisticConcurrencyError } from '../state/pgGraphStore.js';
import { PgBotStore, BotNotFoundError, BotOptimisticConcurrencyError, BotValidationError, HumanSessionRequiredError, validateBotMutation } from '../state/pgBotStore.js';
import { buildAuthHook } from './auth.js';
import { isProjectReadRoute, registerProjectRoutes } from './projectRoutes.js';
import { registerProjectServiceDelegationRoutes } from './projectServiceDelegations.js';
import { registerProjectServiceTargetRoutes } from './projectServiceTargets.js';
import { registerProjectServiceMissionRoutes } from './projectServiceMissions.js';
import { registerCircuitRoutes } from './circuitRoutes.js';
import { registerCircuitDeliveryRoutes } from './circuitDeliveryRoutes.js';
import { registerCircuitGenerationRoutes, type CircuitGenerationDeps } from './circuitGenerationRoutes.js';
import { PgCircuitAttempts } from '../state/pgCircuitAttempts.js';
import { PgCircuitReceipts } from '../state/pgCircuitReceipts.js';
import { PgCircuitStore } from '../state/pgCircuitStore.js';
import type { OrvionServiceClient } from '../integrations/orvionServiceClient.js';
import { isPrivateProjectPath, isPrivateProjectRoute, registerPrivateProjectRoutes } from './privateProjectRoutes.js';
import { isLinkBridgeDecisionPath, registerLinkBridgeRoutes, ReplayGuard, type LinkBridgeConfig, type NodeDecisionResult } from './linkBridgeRoutes.js';
import { registerLinkCircuitBridgeRoutes } from './linkCircuitBridgeRoutes.js';
import type { JsonObject } from '../domain/types.js';
import { verifySupabaseJwt } from './userAuth.js';
import type { UserTokenVerifier } from './userAuth.js';
import { assertScope, MissingScopeError, SCOPES } from './scopes.js';
import { toPublicNodeDTO, validateNodeMutation, NodeMutationValidationError } from './dto.js';
import { SecretCipher } from '../security/crypto.js';
import { SseTicketStore } from './sseTickets.js';
import { PgAuditTrail } from '../observability/auditLog.js';
import { dispatchMcpRequest } from '../mcp/mcpServer.js';
import { Notifier, PgAuditLogger } from '../observability/notifier.js';
import { FixedWindowRateLimiter } from '../observability/rateLimiter.js';
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
    /** Product project reads are opt-in; bootstrap owns deployment activation. */
    projectsEnabled?: boolean;
    /** Circuit APIs stay absent until the additive SQL and project bindings are qualified. */
    circuitsEnabled?: boolean;
    projectServiceDelegationsEnabled?: boolean;
    /** Livraison Orvion sous reçu : présent seulement quand CIRCUIT_DELIVERY_ENABLED et la configuration sont complets.
     * `engine` (optionnel) ajoute l'étape de génération sous tentative durable ; absent → routes de génération en 404. */
    circuitDelivery?: { orvion: OrvionServiceClient; engine?: { client: CircuitGenerationDeps['engine']; engineId: string } };
    /** Independent opt-in; no legacy authentication or graph authority is delegated. */
    privateProjectsEnabled?: boolean;
    privateProjectsIssuer?: string;
    /** Dedicated bounded verifier for the private runtime; leaves legacy JWKS behavior intact. */
    privateProjectsVerifyUserToken?: UserTokenVerifier;
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
    /**
     * Pont LINK ↔ hub Synapse (décisions relayées par acteur signé + attestations
     * d'identité). Absent → `/api/link-bridge/*` et `/api/identity-links/*`
     * répondent 404. Le bootstrap ne le fournit que si LINK_BRIDGE_ENABLED=1
     * ET que la configuration (clés, URL du hub) est complète.
     */
    linkBridge?: LinkBridgeConfig;
    /** Horloge en secondes Unix pour la fraîcheur des assertions (tests). */
    linkBridgeNow?: () => number;
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
    // Partagé entre TOUTES les requêtes : storeFor() instancie un Notifier par
    // requête (le store, lui, doit être scoped par requête), mais le limiteur
    // de débit doit survivre entre les requêtes pour compter réellement 60/min
    // par workspace — un limiteur neuf à chaque appel repartait de zéro et ne
    // limitait jamais rien. Audit P2.
    const outboundRateLimiter = new FixedWindowRateLimiter({ max: 60, windowMs: 60_000 });

    // Chiffrement au repos — optionnel (si la clé n'est pas configurée, les
    // nœuds sont stockés en clair et restent lisibles, rétro-compatible).
    let _cipher: SecretCipher | null | undefined;
    const getCipher = (): SecretCipher | null => {
        if (_cipher !== undefined) return _cipher;
        try {
            _cipher = SecretCipher.fromEnv();
        } catch (err) {
            _cipher = null;
            // Absence de la variable = choix rétro-compatible normal, silencieux.
            // Une variable PRÉSENTE mais invalide (mauvaise longueur, base64
            // corrompu) est presque toujours une faute de frappe qui désactive
            // le chiffrement sans que personne ne s'en aperçoive — audit P2.
            if (process.env.INTEGRATION_ENCRYPTION_KEY?.trim()) {
                console.error(
                    '[orchestrator] INTEGRATION_ENCRYPTION_KEY est définie mais invalide — ' +
                        'le chiffrement au repos est DÉSACTIVÉ, les secrets seront stockés en clair.',
                    { error: err instanceof Error ? err.message : String(err) },
                );
            }
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
        metadata?: JsonObject,
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
                ...(metadata ? { metadata } : {}),
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
        if (path.includes('/service-delegations') || path === '/api/service-projects' || path === '/api/service-missions') reply.header('Cache-Control','private, no-store');
        if (isPrivateProjectPath(path)) {
            reply.header('Cache-Control', 'private, no-store');
            if (deps.privateProjectsEnabled !== true || !isPrivateProjectRoute(req)) {
                return reply.code(404).send({ error: 'PRIVATE_PROJECTS_NOT_FOUND' });
            }
            return; // The private plugin owns every authentication/error boundary here.
        }
        if (PUBLIC_PATHS.has(path)) return;
        if (isSseStreamPath(req.url)) return; // authentifié par ticket dans le handler
        // Décisions relayées par LINK : authentifiées par l'assertion d'acteur
        // signée du hub (en-tête X-Synapse-Actor), jamais par Bearer. Le handler
        // porte tous les contrôles ; 404 tant que le pont n'est pas configuré.
        if (isLinkBridgeDecisionPath(path)) {
            reply.header('Cache-Control', 'private, no-store');
            if (!deps.linkBridge) return reply.code(404).send({ error: 'LINK_BRIDGE_NOT_FOUND' });
            return;
        }
        // Project reads run the existing auth inside their own error/cache boundary.
        if (deps.projectsEnabled === true && isProjectReadRoute(req)) return;
        if (!req.url.startsWith('/api/') && !req.url.startsWith('/mcp')) return;
        await authHook(req, reply);
    });

    if (deps.projectsEnabled === true) registerProjectRoutes(app, deps);
    if (deps.projectServiceDelegationsEnabled === true && deps.projectsEnabled === true && deps.circuitsEnabled === true) {
        registerProjectServiceDelegationRoutes(app, deps.sql, deps.notifierOptions?.appUrl);
        registerProjectServiceTargetRoutes(app, deps.sql, deps.notifierOptions?.appUrl);
        registerProjectServiceMissionRoutes(app, deps.sql, deps.notifierOptions?.appUrl);
    }
    if (deps.circuitsEnabled === true) registerCircuitRoutes(app, { ...deps, appUrl: deps.notifierOptions?.appUrl });
    if (deps.circuitDelivery) {
        // Échec explicite : la livraison ne s'enregistre jamais à moitié câblée.
        if (deps.projectServiceDelegationsEnabled !== true || deps.projectsEnabled !== true || deps.circuitsEnabled !== true || !deps.notifierOptions?.appUrl?.startsWith('https://')) throw new Error('CIRCUIT_DELIVERY_CONFIG_INCOMPLETE');
        registerCircuitDeliveryRoutes(app, {
            sql: deps.sql, appUrl: deps.notifierOptions.appUrl, orvion: deps.circuitDelivery.orvion,
            receiptsFor: workspaceId => new PgCircuitReceipts(deps.sql, workspaceId),
            storeFor: workspaceId => new PgCircuitStore(deps.sql, workspaceId),
        });
        if (deps.circuitDelivery.engine) registerCircuitGenerationRoutes(app, {
            sql: deps.sql, appUrl: deps.notifierOptions.appUrl, engine: deps.circuitDelivery.engine.client, engineId: deps.circuitDelivery.engine.engineId,
            attemptsFor: workspaceId => new PgCircuitAttempts(deps.sql, workspaceId),
            receiptsFor: workspaceId => new PgCircuitReceipts(deps.sql, workspaceId),
            storeFor: workspaceId => new PgCircuitStore(deps.sql, workspaceId),
        });
    }
    if (deps.privateProjectsEnabled === true) registerPrivateProjectRoutes(app, {
        sql: deps.sql,
        issuer: deps.privateProjectsIssuer ?? '',
        verifyUserToken: deps.privateProjectsVerifyUserToken ?? deps.verifyUserToken ?? (deps.jwtSecret
            ? async token => verifySupabaseJwt(token, deps.jwtSecret!)
            : undefined)!,
        allowedOrigins,
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
                        userId: req.userId,
                        scopes: req.scopes,
                        mcpClient: mcp,
                        cipher: getCipher(),
                        synapseProducer,
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
                rateLimiter: outboundRateLimiter,
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
        /** Présence rapportée par LINK (ex. 'online'). Observation, pas état. */
        presence?: string | null;
        /** Cadence déclarée (ex. 'à la demande (gate 3)'). Informatif. */
        cadence?: string | null;
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

            // Un seul agent Hermes/LINK en échec (id dupliqué, contrainte SQL)
            // ne doit pas laisser un import partiel : tout le lot est ATOMIQUE.
            // `has()` est lu DANS la même transaction que l'upsert qui suit,
            // pour que le compte créés/mis à jour reste correct même face à un
            // import concurrent du même workspace. Audit P2.
            const actor = req.userId
                ? ({ kind: 'user', id: req.userId } as const)
                : ({ kind: 'api_key', id: req.apiKeyId } as const);
            const workspaceId = req.workspaceId!;
            const { created, updated } = await deps.sql.begin(async (tx) => {
                const txStore = new PgGraphStore(tx, workspaceId, actor, getCipher());
                let created = 0;
                let updated = 0;
                for (const agent of agents) {
                    if (!agent.enabled) continue;
                    const existed = await txStore.has(agent.id);
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
                    await txStore.upsertNode(node);
                    // `external_app` et l'observation de la source sont posés ICI,
                    // hors de `upsertNode` : ce sont des métadonnées d'import, et
                    // les tenir à l'écart du `on conflict do update` générique est
                    // ce qui fait qu'une édition du nœud depuis la SPA ne les
                    // efface pas. `presence_observed_at` date le relevé — une
                    // présence non datée serait affichée comme courante à tort.
                    await tx`
                        update public.hybrid_nodes
                           set external_app = 'link',
                               presence = ${agent.presence ?? null},
                               presence_observed_at = ${agent.presence ? new Date() : null},
                               cadence = ${agent.cadence ?? null}
                         where id = ${agent.id} and workspace_id = ${workspaceId}
                    `;
                    if (existed) updated += 1;
                    else created += 1;
                }
                return { created, updated };
            });

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
                skills: body.skills ?? [],
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
                // `skills`/`avatarUrl` absents ⇒ on reprend l'existant, même
                // règle que les champs sensibles ci-dessus (audit P2 : un PUT
                // partiel ne doit jamais effacer ce qu'il n'a pas mentionné).
                skills: body.skills === undefined ? existing.skills : body.skills,
                mcpConfig: body.mcpConfig === undefined ? existing.mcpConfig : (body.mcpConfig ?? undefined),
                notificationChannels:
                    body.notificationChannels === undefined
                        ? existing.notificationChannels
                        : (body.notificationChannels ?? undefined),
                avatarUrl: body.avatarUrl === undefined ? existing.avatarUrl : (body.avatarUrl ?? undefined),
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

    // ─────────────────────────────────────────────────────────────────────
    // Bots conversationnels (personas Hermès) — création/édition visuelle
    // dans Organigrad. Un bot est une fiche structurée (`bot_profiles`) qui
    // compile son propre prompt système ; il n'apparaît PAS automatiquement
    // dans `hybrid_nodes` — voir POST /api/bots/:id/link-node pour l'y
    // représenter comme un nœud AGENT_IA visible dans l'Orchestration.
    // ─────────────────────────────────────────────────────────────────────

    // --- GET /api/bots -------------------------------------------------------
    app.get('/api/bots', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsRead);
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const bots = await store.list();
            return { bots };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- GET /api/bots/bundle — paquet de synchronisation Hermès -------------
    // Route déclarée AVANT /api/bots/:id pour que Fastify ne route jamais
    // 'bundle' vers le paramètre :id.
    app.get('/api/bots/bundle', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsExport);
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const bundle = await store.bundle();
            recordAudit(req, 'bots:export', null, 'success');
            return bundle;
        } catch (err) {
            recordAudit(req, 'bots:export', null, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- GET /api/bots/:id/activation — vérifications, sans écriture -------
    app.get<{ Params: { id: string } }>('/api/bots/:id/activation', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsRead);
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const activation = await store.activationStatus(req.params.id, req.userId);
            return { activation };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/bots/:id/activation — décision humaine owner/admin -------
    app.post<{ Params: { id: string } }>('/api/bots/:id/activation', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsWrite);
            assertScope(req.scopes, SCOPES.workspaceAdmin);
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const activation = await store.activateVerified(req.params.id, req.userId);
            recordAudit(req, 'bots:activate', req.params.id, 'success');
            return { activation };
        } catch (err) {
            recordAudit(req, 'bots:activate', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- DELETE /api/bots/:id/activation — retrait humain immédiat ----------
    app.delete<{ Params: { id: string }; Body: { reason?: unknown } }>('/api/bots/:id/activation', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsWrite);
            assertScope(req.scopes, SCOPES.workspaceAdmin);
            if (typeof req.body?.reason !== 'string') throw new BotValidationError('reason', 'Un motif de désactivation est requis.');
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const activation = await store.deactivate(req.params.id, req.body.reason, req.userId);
            recordAudit(req, 'bots:deactivate', req.params.id, 'success');
            return { activation };
        } catch (err) {
            recordAudit(req, 'bots:deactivate', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- GET /api/bots/:id -----------------------------------------------
    app.get<{ Params: { id: string } }>('/api/bots/:id', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsRead);
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const bot = await store.get(req.params.id);
            return { bot };
        } catch (err) {
            return handleError(reply, err);
        }
    });

    // --- POST /api/bots — création (le prompt est recalculé côté serveur) ----
    app.post<{ Body: unknown }>('/api/bots', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsWrite);
            assertScope(req.scopes, SCOPES.graphWrite);
            const body = validateBotMutation(req.body);
            if (body.updated_at) throw new BotValidationError('updated_at', 'Une création ne prend pas de version ; utilisez PUT pour modifier.');
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const bot = await store.createWithNode(body);
            recordAudit(req, 'bots:create', bot.id, 'success');
            return reply.code(201).send({ bot });
        } catch (err) {
            recordAudit(req, 'bots:create', null, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- PUT /api/bots/:id — mise à jour ---------------------------------
    app.put<{ Params: { id: string }; Body: unknown }>('/api/bots/:id', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsWrite);
            assertScope(req.scopes, SCOPES.graphWrite);
            const body = validateBotMutation({ ...(req.body as object), id: req.params.id });
            if (!body.updated_at) throw new BotValidationError('updated_at', 'La version chargée est requise pour modifier un bot.');
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            const bot = await store.updateWithNode(body);
            recordAudit(req, 'bots:update', bot.id, 'success');
            return { bot };
        } catch (err) {
            recordAudit(req, 'bots:update', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- DELETE /api/bots/:id ---------------------------------------------
    app.delete<{ Params: { id: string } }>('/api/bots/:id', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsWrite);
            assertScope(req.scopes, SCOPES.workspaceAdmin);
            const store = new PgBotStore(deps.sql, req.workspaceId!);
            await store.remove(req.params.id);
            recordAudit(req, 'bots:delete', req.params.id, 'success');
            return reply.code(204).send();
        } catch (err) {
            recordAudit(req, 'bots:delete', req.params.id, auditResultOf(err));
            return handleError(reply, err);
        }
    });

    // --- POST /api/bots/:id/link-node — représente le bot dans l'organigramme -
    // Crée/actualise le nœud AGENT_IA jumeau (même id) dans hybrid_nodes, pour
    // que le bot soit visible et exécutable depuis la vue Orchestration. Sans
    // copie de prompt dans le nœud : celui-ci reste dans bot_profiles (B3).
    app.post<{ Params: { id: string } }>('/api/bots/:id/link-node', async (req, reply) => {
        try {
            assertScope(req.scopes, SCOPES.botsWrite);
            assertScope(req.scopes, SCOPES.graphWrite);
            const botStore = new PgBotStore(deps.sql, req.workspaceId!);
            const bot = await botStore.get(req.params.id);
            const graphStore = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
            // Linking an existing node must not erase its hierarchy, runtime
            // configuration or import ownership. DO NOTHING also protects a
            // concurrent creation between this request and another editor.
            const inserted = await deps.sql<{ id: string }[]>`
                insert into public.hybrid_nodes
                    (id, workspace_id, type, nom, role_titre, parent_id, grade_id, skills, status, external_app)
                values (${bot.id}, ${req.workspaceId!}, 'AGENT_IA', ${bot.displayName},
                    ${bot.brand ? `${bot.family} · ${bot.brand}` : bot.family}, null, 'Agent',
                    ${deps.sql.array([bot.network, bot.family].filter((s): s is string => Boolean(s)))},
                    'IDLE', 'organigrad-bots')
                on conflict (id) do nothing
                returning id
            `;
            const saved = await graphStore.get(bot.id);
            recordAudit(req, 'bots:link_node', bot.id, 'success');
            return { node: toPublicNodeDTO(saved), created: inserted.length > 0 };
        } catch (err) {
            recordAudit(req, 'bots:link_node', req.params.id, auditResultOf(err));
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

    /**
     * Décision humaine sur un nœud (approbation → IDLE + reprise du flux ;
     * rejet → ERROR avec feedback). Séquence UNIQUE partagée par les routes
     * `/api/nodes/:id/approve|reject` (session Bearer) et par le pont LINK
     * (acteur signé par le hub, `linkBridgeRoutes.ts`) : scope, transition,
     * audit, annonce Synapse best-effort, reprise best-effort.
     *
     * L'identité (`req.workspaceId`, `req.userId`, `req.scopes`) DOIT avoir été
     * établie par l'appelant — hook d'auth ou vérification d'assertion — avant
     * l'appel. Lève les erreurs métier ; `decideNodeHttp` les traduit en HTTP.
     */
    const decideNode = async (
        req: import('fastify').FastifyRequest,
        nodeId: string,
        decision: 'approved' | 'rejected',
        feedback?: string,
        auditMetadata?: JsonObject,
    ): Promise<NodeDecisionResult> => {
        const action = decision === 'approved' ? 'human:approve' : 'human:reject';
        const logPrefix = decision === 'approved' ? '[approve]' : '[reject]';
        assertScope(req.scopes, decision === 'approved' ? SCOPES.humanApprove : SCOPES.humanReject);
        const store = storeFor(req.workspaceId!, req.apiKeyId, req.userId);
        if (decision === 'approved') {
            await store.applyTransition(nodeId, 'IDLE');
        } else {
            await store.applyTransition(nodeId, 'ERROR', { feedback: feedback ?? '' });
        }
        recordAudit(req, action, nodeId, 'success', auditMetadata);
        // Hop 5 — annonce la décision officielle sur le bus (best-effort).
        // Enveloppé dans try/catch : une panne Synapse ne doit jamais échouer la réponse HTTP.
        try {
            await synapseProducer.onDecision?.(nodeId, decision, decision === 'approved' ? undefined : (feedback ?? ''), {
                decidedBy: req.userId ?? req.apiKeyId ?? undefined,
                title: await nodeTitleOf(store, nodeId),
            });
        } catch (synapseErr) {
            console.warn(`${logPrefix} Synapse onDecision failed (best-effort)`, synapseErr);
        }
        if (decision === 'rejected') return { ok: true, resumed: false, waitingHumanAt: null };
        // Reprise du workflow après validation humaine (best-effort : un échec
        // de reprise n'invalide pas l'approbation déjà persistée).
        let resume: Awaited<ReturnType<OrchestrationEngine['resumeFromChildOf']>> = null;
        try {
            const engine = new OrchestrationEngine(store, mcp, synapseProducer);
            resume = await engine.resumeFromChildOf(nodeId);
        } catch (resumeErr) {
            recordAudit(req, 'flow:resume', nodeId, 'error', auditMetadata);
            console.warn(`${logPrefix} reprise du flux échouée`, resumeErr);
        }
        return { ok: true, resumed: resume !== null, waitingHumanAt: resume?.waitingHumanAt ?? null };
    };

    /** `decideNode` + traduction HTTP des erreurs (audit denied/error, `handleError`). */
    const decideNodeHttp = async (
        req: import('fastify').FastifyRequest,
        reply: import('fastify').FastifyReply,
        nodeId: string,
        decision: 'approved' | 'rejected',
        feedback?: string,
        auditMetadata?: JsonObject,
    ): Promise<NodeDecisionResult | import('fastify').FastifyReply> => {
        try {
            return await decideNode(req, nodeId, decision, feedback, auditMetadata);
        } catch (err) {
            recordAudit(req, decision === 'approved' ? 'human:approve' : 'human:reject', nodeId, auditResultOf(err), auditMetadata);
            return handleError(reply, err);
        }
    };

    // --- POST /api/nodes/:id/approve ---------------------------------------
    // Validation HUMAINE : exige le scope human:approve, qu'une clé technique
    // ne peut pas obtenir (cf. create_workspace_api_key). Après approbation, le
    // flux REPREND automatiquement à partir de l'aval.
    app.post<{ Params: { id: string } }>('/api/nodes/:id/approve', async (req, reply) =>
        decideNodeHttp(req, reply, req.params.id, 'approved'),
    );

    // --- POST /api/nodes/:id/reject ----------------------------------------
    app.post<{ Params: { id: string }; Body: { feedback?: string } }>(
        '/api/nodes/:id/reject',
        async (req, reply) => {
            const outcome = await decideNodeHttp(req, reply, req.params.id, 'rejected', req.body?.feedback ?? '');
            // Contrat historique du rejet : `{ ok: true }` seulement.
            return 'ok' in outcome ? { ok: true } : outcome;
        },
    );

    // --- Pont LINK : décisions relayées par acteur signé + attestations ------
    const linkBridgeReplays = new ReplayGuard();
    registerLinkBridgeRoutes(app, {
        sql: deps.sql,
        config: deps.linkBridge,
        appUrl: deps.notifierOptions?.appUrl,
        decideNode: decideNodeHttp,
        fetchImpl: deps.fetchImpl,
        fetchLookup: deps.fetchLookup,
        now: deps.linkBridgeNow,
        replays: linkBridgeReplays,
    });
    // --- Pont LINK : dossiers et décisions de CIRCUIT (recette Atelier Boréal).
    // Même assertion d'acteur, même garde anti-rejeu ; exige les circuits.
    registerLinkCircuitBridgeRoutes(app, {
        sql: deps.sql,
        config: deps.circuitsEnabled === true ? deps.linkBridge : undefined,
        appUrl: deps.notifierOptions?.appUrl,
        storeFor: (workspaceId) => new PgCircuitStore(deps.sql, workspaceId),
        replays: linkBridgeReplays,
        now: deps.linkBridgeNow,
    });

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
    if (err instanceof OptimisticConcurrencyError) {
        return reply.code(409).send({
            error: 'CONCURRENT_WRITE',
            nodeId: err.nodeId,
            expectedUpdatedAt: err.expectedUpdatedAt,
            message: 'Le nœud a été modifié depuis son chargement. Rechargez-le avant de réessayer.',
        });
    }
    if (err instanceof IllegalTransitionError) {
        return reply.code(409).send({ error: 'ILLEGAL_TRANSITION', from: err.from, to: err.to });
    }
    if (err instanceof BotValidationError) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', field: err.field, message: err.message });
    }
    if (err instanceof HumanSessionRequiredError) {
        return reply.code(403).send({ error: 'HUMAN_SESSION_REQUIRED' });
    }
    if (err instanceof BotNotFoundError) {
        return reply.code(404).send({ error: 'BOT_NOT_FOUND', botId: err.botId });
    }
    if (err instanceof BotOptimisticConcurrencyError) {
        return reply.code(409).send({
            error: 'CONCURRENT_WRITE',
            botId: err.botId,
            expectedUpdatedAt: err.expectedUpdatedAt,
            message: 'Le bot a été modifié depuis son chargement. Rechargez-le avant de réessayer.',
        });
    }
    // Un 500 = `err.message` brut peut divulguer des détails internes (erreurs
    // SQL du driver `postgres`, chemins de fichiers, etc.) à l'appelant. Le
    // détail va dans les LOGS serveur, jamais dans la réponse — seul un id de
    // requête est renvoyé pour permettre de corréler côté support. Audit P3.
    const requestId = reply.request?.id;
    console.error('[api] erreur interne', {
        requestId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
    });
    return reply.code(500).send({ error: 'INTERNAL_ERROR', requestId });
}
