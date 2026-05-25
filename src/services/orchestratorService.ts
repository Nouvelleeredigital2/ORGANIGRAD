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

export interface SseStatusEvent {
    type: 'NODE_STATUS_CHANGED';
    nodeId: string;
    from: NodeStatus;
    to: NodeStatus;
    timestamp: string;
    payload: Record<string, unknown> | null;
}

export interface OrchestratorClientOptions {
    baseUrl?: string;
    /** Clé API workspace (format `ok_xxx`). Envoyée en `Authorization: Bearer`. */
    apiKey?: string;
    fetchImpl?: typeof fetch;
    eventSourceImpl?: typeof EventSource;
}

export class OrchestratorClient {
    private readonly baseUrl: string;
    private readonly apiKey: string | null;
    private readonly fetchImpl: typeof fetch;
    private readonly eventSourceImpl: typeof EventSource;

    constructor(opts: OrchestratorClientOptions = {}) {
        this.baseUrl = opts.baseUrl ?? '/api';
        this.apiKey = opts.apiKey ?? null;
        this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
        this.eventSourceImpl = opts.eventSourceImpl ?? globalThis.EventSource;
    }

    private authHeaders(): Record<string, string> {
        return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
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

    async fetchGraph(): Promise<HybridNode[]> {
        const res = await this.fetchImpl(`${this.baseUrl}/graph`, {
            headers: this.authHeaders(),
        });
        if (!res.ok) throw new Error(`GET /graph → ${res.status}`);
        const body = (await res.json()) as { nodes: HybridNode[] };
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
        const res = await this.fetchImpl(`${this.baseUrl}/nodes/${id}/${action}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...this.authHeaders() },
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
     * Ouvre un EventSource sur /api/events. Reconnexion automatique gérée par
     * le navigateur. Renvoie une fonction de cleanup.
     */
    subscribe(onEvent: (evt: SseStatusEvent) => void, onError?: (err: Event) => void): () => void {
        if (!this.eventSourceImpl) {
            // Environnement sans EventSource (Node sans polyfill) → no-op
            return () => {};
        }
        // EventSource natif n'accepte pas de headers — passer la clé en query.
        // Le hook auth orchestrateur lit aussi `?key=` (cf. auth.ts côté serveur).
        const url = this.apiKey
            ? `${this.baseUrl}/events?key=${encodeURIComponent(this.apiKey)}`
            : `${this.baseUrl}/events`;
        const es = new this.eventSourceImpl(url);
        const handler = (e: MessageEvent) => {
            try {
                const data = JSON.parse(e.data) as SseStatusEvent;
                onEvent(data);
            } catch {
                /* paquet non-JSON (heartbeat) — ignore */
            }
        };
        es.addEventListener('NODE_STATUS_CHANGED', handler as EventListener);
        if (onError) es.addEventListener('error', onError);
        return () => {
            es.removeEventListener('NODE_STATUS_CHANGED', handler as EventListener);
            es.close();
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
