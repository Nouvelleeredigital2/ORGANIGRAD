/**
 * Client front de l'orchestrateur.
 *
 * Consomme :
 *   - GET  /api/graph        → snapshot du graphe
 *   - GET  /api/events       → flux SSE des transitions
 *   - POST /api/nodes/:id/{run|approve|reject|reset}
 *
 * Si l'orchestrateur est injoignable, `isReachable()` renvoie `false` et le
 * contrôleur de la SPA bascule automatiquement sur le mode brouillon
 * (localStorage / hybridNodeStore).
 */

import type { HybridNode, NodeStatus, McpConfig, NotificationChannels } from '../types/hybridNode';
import type { BotProfile } from '../types/botProfile';
import type { CircuitDecision, CircuitDefinition } from '@apps2026/contracts';
import type { CircuitOptions, CircuitRun, StoredCircuit } from '../types/circuit';

/**
 * Vue PUBLIQUE d'un nœud renvoyée par `GET /api/graph` (cf. DTO côté
 * orchestrateur). Volontairement SANS les champs sensibles (systemPrompt,
 * mcpConfig.serverUrl, notificationChannels) : seuls des indicateurs booléens
 * sont exposés. La SPA n'utilise de toute façon que `id` + `status` du flux
 * orchestrateur ; les données complètes proviennent de Supabase / CSV.
 */
export interface OrchestratorGraphNode {
    id: string;
    updated_at?: string;
    type: HybridNode['type'];
    nom: string;
    roleTitre: string;
    parentID: string | null;
    gradeId: string;
    skills: string[];
    avatarUrl?: string;
    status: NodeStatus;
    hasSystemPrompt: boolean;
    mcp: { configured: boolean; connectedTo: string[] };
    notifications: { slack: boolean; email: boolean };
}

/** Réponse de POST /api/integrations/link/import. */
export interface LinkImportResult {
    ok: true;
    created: number;
    updated: number;
    skipped: number;
    total: number;
}

/** Corps envoyé à POST /api/bots ou PUT /api/bots/:id — voir `validateBotMutation` côté orchestrateur. */
export interface BotMutationPayload {
    id: string;
    updated_at?: string;
    runtimeId: string;
    fileName: string;
    displayName: string;
    avatarUrl?: string | null;
    family: BotProfile['family'];
    brand?: string | null;
    network?: string | null;
    telegramUsername?: string | null;
    mission?: string;
    personality?: string;
    research?: string;
    watch?: string;
    deliverables?: string;
    method?: string;
    limits?: string;
    usefulContext?: string;
    sources?: BotProfile['sources'];
    model?: BotProfile['model'];
    enabled?: boolean;
}

/** Paquet de synchronisation Hermès — GET /api/bots/bundle. */
export interface BotBundle {
    files: Record<string, { agent: string; content: string; sha256: string }>;
}

export interface SseStatusEvent {
    type: 'NODE_STATUS_CHANGED';
    nodeId: string;
    from: NodeStatus;
    to: NodeStatus;
    timestamp: string;
    payload: Record<string, unknown> | null;
}

/** Corps envoyé à POST /api/nodes ou PUT /api/nodes/:id. */
export interface NodeMutationPayload {
    id: string;
    updated_at?: string;
    type: HybridNode['type'];
    nom: string;
    roleTitre: string;
    parentID?: string | null;
    gradeId: string;
    systemPrompt?: string | null;
    skills?: string[];
    mcpConfig?: McpConfig | null;
    notificationChannels?: NotificationChannels | null;
    avatarUrl?: string | null;
}

export interface UserAuth {
    /** JWT de session Supabase de l'utilisateur. */
    token: string;
    /** Workspace courant (envoyé en en-tête X-Workspace-Id). */
    workspaceId: string;
}

/** Délai au-delà duquel un orchestrateur muet est traité comme injoignable. */
export const SONDE_TIMEOUT_MS = 8_000;

/**
 * Signal d'abandon après `ms`. `AbortSignal.timeout` n'existe pas partout
 * (jsdom ancien, environnements de test) : on retombe alors sur un
 * `AbortController` + `setTimeout`, plutôt que de perdre le délai maximal.
 */
function delaiMaximal(ms: number): AbortSignal {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(ms);
    }
    const controleur = new AbortController();
    setTimeout(() => controleur.abort(), ms);
    return controleur.signal;
}

export interface OrchestratorClientOptions {
    baseUrl?: string;
    /** Clé API workspace (format `ok_xxx`). Envoyée en `Authorization: Bearer`. */
    apiKey?: string;
    /**
     * Fournit la session utilisateur (JWT) pour les actions HUMAINES
     * (approve/reject/reset) — l'orchestrateur exige une session vérifiée, pas
     * une clé technique. Si absent, on retombe sur la clé API.
     */
    getUserAuth?: () => Promise<UserAuth | null>;
    fetchImpl?: typeof fetch;
    eventSourceImpl?: typeof EventSource;
}

export class OrchestratorClient {
    private readonly baseUrl: string;
    private readonly apiKey: string | null;
    private readonly getUserAuth?: () => Promise<UserAuth | null>;
    private readonly fetchImpl: typeof fetch;
    private readonly eventSourceImpl: typeof EventSource;

    constructor(opts: OrchestratorClientOptions = {}) {
        this.baseUrl = opts.baseUrl ?? '/api';
        this.apiKey = opts.apiKey ?? null;
        this.getUserAuth = opts.getUserAuth;
        this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
        this.eventSourceImpl = opts.eventSourceImpl ?? globalThis.EventSource;
    }

    private authHeaders(): Record<string, string> {
        return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
    }

    /**
     * En-têtes pour une action HUMAINE : session utilisateur (JWT + workspace) si
     * disponible, sinon repli sur la clé API (qui, sans scope humain, sera refusée
     * par l'orchestrateur — comportement voulu).
     */
    private async humanHeaders(): Promise<Record<string, string>> {
        const u = this.getUserAuth ? await this.getUserAuth() : null;
        if (u) {
            return { authorization: `Bearer ${u.token}`, 'x-workspace-id': u.workspaceId };
        }
        return this.authHeaders();
    }

    /**
     * Sonde de disponibilité, BORNÉE DANS LE TEMPS.
     *
     * Sans délai maximal, un orchestrateur qui accepte la connexion TCP mais ne
     * répond jamais (service figé, proxy qui retient la requête) laissait cette
     * promesse en attente indéfiniment. L'interface restait alors bloquée sur
     * son état d'avant-sonde, sans jamais pouvoir dire « indisponible » : un
     * serveur muet est plus difficile à diagnostiquer qu'un serveur en erreur.
     */
    async isReachable(timeoutMs = SONDE_TIMEOUT_MS): Promise<boolean> {
        try {
            const res = await this.fetchImpl(`${this.baseUrl}/graph`, {
                method: 'GET',
                headers: { accept: 'application/json', ...this.authHeaders() },
                signal: delaiMaximal(timeoutMs),
            });
            return res.ok;
        } catch {
            // Inclut l'expiration du délai : injoignable en pratique.
            return false;
        }
    }

    async fetchGraph(): Promise<OrchestratorGraphNode[]> {
        const res = await this.fetchImpl(`${this.baseUrl}/graph`, {
            headers: this.authHeaders(),
        });
        if (!res.ok) throw new Error(`GET /graph → ${res.status}`);
        const body = (await res.json()) as { nodes: OrchestratorGraphNode[] };
        return body.nodes;
    }

    async runNode(id: string): Promise<void> {
        await this.postAction(id, 'run');
    }

    /** Exécute la CHAÎNE complète depuis un nœud racine (et non un seul nœud). */
    async runFlow(id: string): Promise<void> {
        await this.postAction(id, 'run-flow');
    }

    async approve(id: string): Promise<void> {
        await this.postAction(id, 'approve');
    }

    async reject(id: string, feedback: string): Promise<void> {
        await this.postAction(id, 'reject', { feedback });
    }

    async reset(id: string): Promise<void> {
        await this.postAction(id, 'reset');
    }

    /** Crée ou met à jour un nœud (chiffrement côté serveur). Exige graph:write. */
    async upsertNode(node: NodeMutationPayload, workspaceId: string): Promise<OrchestratorGraphNode> {
        const headers = await this.humanHeaders();
        const isCreate = !(await this.nodeExists(node.id));
        const method = isCreate ? 'POST' : 'PUT';
        const url = isCreate ? `${this.baseUrl}/nodes` : `${this.baseUrl}/nodes/${node.id}`;
        const res = await this.fetchImpl(url, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify({ ...node, workspaceId }),
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            if (res.status === 409 && (detail as { error?: unknown }).error === 'CONCURRENT_WRITE') {
                throw new OrchestratorConflictError(node.id, node.updated_at, detail);
            }
            throw new OrchestratorClientError(`HTTP_${res.status}`, res.status, detail);
        }
        const body = (await res.json()) as { node: OrchestratorGraphNode };
        return body.node;
    }

    /** Supprime un nœud. Exige graph:write. */
    async removeNode(id: string): Promise<void> {
        const headers = await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/nodes/${id}`, {
            method: 'DELETE',
            headers,
        });
        if (res.status === 404) return; // déjà absent — idempotent
        if (!res.ok) throw new OrchestratorClientError(`HTTP_${res.status}`, res.status);
    }

    /**
     * Importe les bots Hermes/LINK comme des nœuds AGENT_IA (référence par id
     * LINK, pas de copie de prompt — B3). Action humaine réservée admin :
     * exige workspace:admin, qu'une clé API n'a jamais (cf. scopes serveur).
     */
    async importLinkAgents(): Promise<LinkImportResult> {
        const headers = await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/integrations/link/import`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            // Fastify refuse un content-type JSON sans corps (FST_ERR_CTP_EMPTY_JSON_BODY).
            body: '{}',
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            throw new OrchestratorClientError(`HTTP_${res.status}`, res.status, detail);
        }
        return (await res.json()) as LinkImportResult;
    }

    // ── Bots conversationnels (personas Hermès) ──────────────────────────
    // Édition traitée comme une action humaine (session vérifiée), au même
    // titre que l'édition d'un nœud — cf. upsertNode ci-dessus.

    async fetchBots(): Promise<BotProfile[]> {
        const headers = await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/bots`, { headers });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            throw new OrchestratorClientError(`HTTP_${res.status}`, res.status, detail);
        }
        const body = (await res.json()) as { bots: BotProfile[] };
        return body.bots;
    }

    private async circuitRequest<T>(path: string, body?: unknown, method='GET'): Promise<T> {
        const headers=await this.humanHeaders();
        const res=await this.fetchImpl(`${this.baseUrl}${path}`,{method,headers:{...headers,'Content-Type':'application/json'},cache:'no-store',redirect:'error',signal:delaiMaximal(10000),...(body===undefined?{}:{body:JSON.stringify(body)})});
        if(!res.ok)throw new OrchestratorClientError(`HTTP_${res.status}`,res.status,await res.json().catch(()=>({})));
        return res.json() as Promise<T>;
    }
    async fetchCircuits():Promise<StoredCircuit[]> {
        return (await this.circuitRequest<{circuits:StoredCircuit[]}>('/circuits')).circuits;
    }
    async fetchCircuitOptions():Promise<CircuitOptions> { return this.circuitRequest('/circuits/options'); }
    async fetchCircuitRuns():Promise<CircuitRun[]> { return (await this.circuitRequest<{runs:CircuitRun[]}>('/circuit-runs')).runs; }
    async decideCircuitRun(id:string,decision:CircuitDecision):Promise<CircuitRun> {
        return (await this.circuitRequest<{run:CircuitRun}>(`/circuit-runs/${encodeURIComponent(id)}/decisions`,decision,'POST')).run;
    }
    async controlCircuitRun(id:string,input:{action:'pause'|'resume'|'cancel';expectedVersion:number;idempotencyKey:string}):Promise<CircuitRun> {
        return (await this.circuitRequest<{run:CircuitRun}>(`/circuit-runs/${encodeURIComponent(id)}/control`,input,'POST')).run;
    }
    async saveCircuit(definition:CircuitDefinition,existing?:StoredCircuit):Promise<StoredCircuit> {
        return (await this.circuitRequest<{circuit:StoredCircuit}>(existing?`/circuits/${encodeURIComponent(existing.id)}`:'/circuits',{definition,...(existing?{expectedVersion:existing.version}:{})},existing?'PUT':'POST')).circuit;
    }

    async upsertBot(bot: BotMutationPayload): Promise<BotProfile> {
        const headers = await this.humanHeaders();
        const isCreate = !bot.updated_at;
        const method = isCreate ? 'POST' : 'PUT';
        const url = isCreate ? `${this.baseUrl}/bots` : `${this.baseUrl}/bots/${bot.id}`;
        const res = await this.fetchImpl(url, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(bot),
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            if (res.status === 409 && (detail as { error?: unknown }).error === 'CONCURRENT_WRITE') {
                throw new OrchestratorConflictError(bot.id, bot.updated_at, detail);
            }
            throw new OrchestratorClientError(`HTTP_${res.status}`, res.status, detail);
        }
        const body = (await res.json()) as { bot: BotProfile };
        return body.bot;
    }

    async removeBot(id: string): Promise<void> {
        const headers = await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/bots/${id}`, { method: 'DELETE', headers });
        if (res.status === 404) return; // déjà absent — idempotent
        if (!res.ok) throw new OrchestratorClientError(`HTTP_${res.status}`, res.status);
    }

    /** Crée/actualise le nœud AGENT_IA jumeau du bot, pour le voir dans la vue Orchestration. */
    async linkBotNode(id: string): Promise<OrchestratorGraphNode> {
        const headers = await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/bots/${id}/link-node`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: '{}',
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            throw new OrchestratorClientError(`HTTP_${res.status}`, res.status, detail);
        }
        const body = (await res.json()) as { node: OrchestratorGraphNode };
        return body.node;
    }

    /** Paquet de synchronisation Hermès (prompts compilés + empreintes) — scope bots:export. */
    async fetchBotBundle(): Promise<BotBundle> {
        const headers = await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/bots/bundle`, { headers });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            throw new OrchestratorClientError(`HTTP_${res.status}`, res.status, detail);
        }
        return (await res.json()) as BotBundle;
    }

    /**
     * `res.status !== 404` traitait TOUTE réponse non-404 comme « existe » —
     * y compris un 401/403/500, poussant `upsertNode` à choisir PUT pour un
     * nœud dont l'existence réelle est inconnue. On ne conclut désormais
     * « existe » / « n'existe pas » que sur une réponse sans ambiguïté ;
     * tout le reste échoue explicitement, comme le ferait la requête
     * PUT/POST suivante de toute façon. Audit P3.
     */
    private async nodeExists(id: string): Promise<boolean> {
        const headers = await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/nodes/${id}`, { headers });
        if (res.status === 404) return false;
        if (res.ok) return true;
        const detail = await res.json().catch(() => ({}));
        throw new OrchestratorClientError(`HTTP_${res.status}`, res.status, detail);
    }

    private async postAction(
        id: string,
        action: 'run' | 'run-flow' | 'approve' | 'reject' | 'reset',
        body?: Record<string, unknown>,
    ): Promise<void> {
        // run / run-flow = actions techniques (clé API) ; approve/reject/reset =
        // actions humaines (session utilisateur vérifiée requise par l'orchestrateur).
        const headers =
            action === 'run' || action === 'run-flow'
                ? this.authHeaders()
                : await this.humanHeaders();
        const res = await this.fetchImpl(`${this.baseUrl}/nodes/${id}/${action}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body ?? {}),
        });
        if (res.status === 404) throw new OrchestratorClientError('NODE_NOT_FOUND', 404);
        if (res.status === 409) {
            const detail = await res.json().catch(() => ({}));
            throw new OrchestratorClientError('ILLEGAL_TRANSITION', 409, detail);
        }
        if (!res.ok) throw new OrchestratorClientError(`HTTP_${res.status}`, res.status);
    }

    /**
     * Demande un ticket SSE court à usage unique (auth par Bearer). Le ticket
     * remplace la clé API permanente dans l'URL du flux (cf. Priorité 7).
     */
    private async fetchSseTicket(): Promise<string> {
        const res = await this.fetchImpl(`${this.baseUrl}/events/ticket`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...this.authHeaders() },
            body: '{}',
        });
        if (!res.ok) throw new OrchestratorClientError(`TICKET_${res.status}`, res.status);
        const body = (await res.json()) as { ticket: string };
        return body.ticket;
    }

    /**
     * Ouvre un flux SSE authentifié par ticket. Comme le ticket est à usage
     * unique, on ne s'appuie PAS sur la reconnexion auto d'EventSource (qui
     * réutiliserait un ticket déjà consommé) : on gère nous-mêmes la reconnexion
     * en redemandant un ticket frais. Renvoie une fonction de cleanup.
     */
    subscribe(
        onEvent: (evt: SseStatusEvent) => void,
        onError?: (err: Event) => void,
        /**
         * Appelé à CHAQUE ouverture du flux, y compris après une reconnexion.
         * Sans ce rappel, une interruption laissait l'interface en « dégradé »
         * définitivement : `onError` faisait basculer l'état, et rien ne le
         * ramenait jamais — même une fois le flux rétabli.
         */
        onOpen?: () => void,
    ): () => void {
        if (!this.eventSourceImpl) {
            // Environnement sans EventSource (Node sans polyfill) → no-op
            return () => {};
        }

        let closed = false;
        let es: EventSource | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const handler = (e: MessageEvent) => {
            try {
                onEvent(JSON.parse(e.data) as SseStatusEvent);
            } catch {
                /* paquet non-JSON (heartbeat) — ignore */
            }
        };

        const connect = async () => {
            if (closed) return;
            try {
                const ticket = await this.fetchSseTicket();
                if (closed) return;
                es = new this.eventSourceImpl(
                    `${this.baseUrl}/events?ticket=${encodeURIComponent(ticket)}`,
                );
                es.addEventListener('NODE_STATUS_CHANGED', handler as EventListener);
                es.addEventListener('open', () => {
                    if (!closed) onOpen?.();
                });
                es.addEventListener('error', (ev) => {
                    onError?.(ev);
                    // Connexion perdue → on ferme et on reconnecte avec un ticket frais.
                    if (closed) return;
                    es?.close();
                    es = null;
                    scheduleReconnect();
                });
            } catch {
                onError?.(new Event('error'));
                scheduleReconnect();
            }
        };

        const scheduleReconnect = () => {
            if (closed || retryTimer) return;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                void connect();
            }, 3000);
        };

        void connect();

        return () => {
            closed = true;
            if (retryTimer) clearTimeout(retryTimer);
            es?.removeEventListener('NODE_STATUS_CHANGED', handler as EventListener);
            es?.close();
        };
    }
}

export class OrchestratorClientError extends Error {
    readonly code: string;
    readonly status: number;
    readonly detail?: unknown;

    constructor(code: string, status: number, detail?: unknown) {
        super(`OrchestratorClient: ${code} (${status})`);
        this.name = 'OrchestratorClientError';
        this.code = code;
        this.status = status;
        this.detail = detail;
    }
}

export class OrchestratorConflictError extends OrchestratorClientError {
    readonly nodeId: string;
    readonly expectedUpdatedAt?: string;

    constructor(nodeId: string, expectedUpdatedAt: string | undefined, detail?: unknown) {
        super('CONCURRENT_WRITE', 409, detail);
        this.name = 'OrchestratorConflictError';
        this.nodeId = nodeId;
        this.expectedUpdatedAt = expectedUpdatedAt;
    }
}
