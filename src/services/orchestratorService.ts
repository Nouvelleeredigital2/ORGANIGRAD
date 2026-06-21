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

import type { HybridNode, NodeStatus } from '../types/hybridNode';

/**
 * Vue PUBLIQUE d'un nœud renvoyée par `GET /api/graph` (cf. DTO côté
 * orchestrateur). Volontairement SANS les champs sensibles (systemPrompt,
 * mcpConfig.serverUrl, notificationChannels) : seuls des indicateurs booléens
 * sont exposés. La SPA n'utilise de toute façon que `id` + `status` du flux
 * orchestrateur ; les données complètes proviennent de Supabase / CSV.
 */
export interface OrchestratorGraphNode {
    id: string;
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
    notifications: { slack: boolean; email: boolean; whatsapp: boolean };
}

export interface SseStatusEvent {
    type: 'NODE_STATUS_CHANGED';
    nodeId: string;
    from: NodeStatus;
    to: NodeStatus;
    timestamp: string;
    payload: Record<string, unknown> | null;
}

export interface UserAuth {
    /** JWT de session Supabase de l'utilisateur. */
    token: string;
    /** Workspace courant (envoyé en en-tête X-Workspace-Id). */
    workspaceId: string;
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

    async isReachable(): Promise<boolean> {
        try {
            const res = await this.fetchImpl(`${this.baseUrl}/graph`, {
                method: 'GET',
                headers: { accept: 'application/json', ...this.authHeaders() },
            });
            return res.ok;
        } catch {
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

    async approve(id: string): Promise<void> {
        await this.postAction(id, 'approve');
    }

    async reject(id: string, feedback: string): Promise<void> {
        await this.postAction(id, 'reject', { feedback });
    }

    async reset(id: string): Promise<void> {
        await this.postAction(id, 'reset');
    }

    private async postAction(
        id: string,
        action: 'run' | 'approve' | 'reject' | 'reset',
        body?: Record<string, unknown>,
    ): Promise<void> {
        // run = action technique (clé API) ; approve/reject/reset = action humaine
        // (session utilisateur vérifiée requise par l'orchestrateur).
        const headers =
            action === 'run' ? this.authHeaders() : await this.humanHeaders();
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
    subscribe(onEvent: (evt: SseStatusEvent) => void, onError?: (err: Event) => void): () => void {
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
