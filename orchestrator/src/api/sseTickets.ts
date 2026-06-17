import { randomBytes } from 'node:crypto';

/**
 * Tickets SSE courts à usage unique (Priorité 7).
 *
 * EventSource ne peut pas porter d'en-tête `Authorization`. Plutôt que de faire
 * transiter une clé API PERMANENTE dans la query string (`?key=` — fuit dans les
 * logs, proxies, historiques), le client :
 *   1. POST /api/events/ticket  (authentifié par Bearer + scope execution:read)
 *   2. ouvre EventSource /api/events?ticket=<ticket>
 *
 * Le ticket :
 *   - expire en quelques secondes (TTL court) ;
 *   - est lié à un workspace, un apiKey et ses scopes ;
 *   - est consommé à la première utilisation (single-use) ;
 *   - n'est PAS une clé API : sa fuite n'expose qu'une fenêtre de quelques
 *     secondes pour ouvrir un flux en lecture seule.
 */

export interface SseTicketData {
    workspaceId: string;
    apiKeyId?: string;
    scopes: string[];
}

interface StoredTicket extends SseTicketData {
    expiresAt: number;
}

export interface SseTicketStoreOptions {
    /** Durée de vie du ticket en ms (défaut : 30 s). */
    ttlMs?: number;
    /** Source d'horloge injectable (tests). */
    now?: () => number;
}

export class SseTicketStore {
    private tickets = new Map<string, StoredTicket>();
    private readonly ttlMs: number;
    private readonly now: () => number;

    constructor(opts: SseTicketStoreOptions = {}) {
        this.ttlMs = opts.ttlMs ?? 30_000;
        this.now = opts.now ?? (() => Date.now());
    }

    /** Crée un ticket opaque lié au workspace/clé/scopes. */
    issue(data: SseTicketData): string {
        const ticket = randomBytes(32).toString('hex');
        this.tickets.set(ticket, { ...data, expiresAt: this.now() + this.ttlMs });
        this.sweep();
        return ticket;
    }

    /**
     * Consomme un ticket (single-use). Renvoie ses données s'il est valide et
     * non expiré, sinon `null`. Le ticket est supprimé dans tous les cas où il
     * existait.
     */
    consume(ticket: string | undefined): SseTicketData | null {
        if (!ticket) return null;
        const stored = this.tickets.get(ticket);
        if (!stored) return null;
        this.tickets.delete(ticket); // single-use, même si expiré
        if (stored.expiresAt <= this.now()) return null;
        return { workspaceId: stored.workspaceId, apiKeyId: stored.apiKeyId, scopes: stored.scopes };
    }

    /** Purge les tickets expirés (borne la mémoire). */
    private sweep(): void {
        const t = this.now();
        for (const [k, v] of this.tickets) {
            if (v.expiresAt <= t) this.tickets.delete(k);
        }
    }

    get size(): number {
        return this.tickets.size;
    }
}
