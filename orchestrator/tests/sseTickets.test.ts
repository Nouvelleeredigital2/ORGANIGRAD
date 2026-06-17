import { describe, it, expect } from 'vitest';
import { SseTicketStore } from '../src/api/sseTickets.js';

/**
 * Tests du store de tickets SSE (Priorité 7) — hermétiques, horloge injectée.
 */
describe('SseTicketStore', () => {
    it('émet un ticket opaque et le consomme une seule fois', () => {
        const t = 1000;
        const store = new SseTicketStore({ ttlMs: 30_000, now: () => t });
        const ticket = store.issue({ workspaceId: 'ws-1', apiKeyId: 'k1', scopes: ['execution:read'] });

        expect(ticket).toMatch(/^[0-9a-f]{64}$/); // 32 octets hex
        const first = store.consume(ticket);
        expect(first).toEqual({ workspaceId: 'ws-1', apiKeyId: 'k1', scopes: ['execution:read'] });

        // Single-use : la 2ᵉ consommation échoue.
        expect(store.consume(ticket)).toBeNull();
    });

    it('refuse un ticket expiré', () => {
        let t = 1000;
        const store = new SseTicketStore({ ttlMs: 5_000, now: () => t });
        const ticket = store.issue({ workspaceId: 'ws-1', scopes: ['execution:read'] });
        t += 6_000; // dépasse le TTL
        expect(store.consume(ticket)).toBeNull();
    });

    it('refuse un ticket inconnu ou vide', () => {
        const store = new SseTicketStore();
        expect(store.consume('nexistepas')).toBeNull();
        expect(store.consume(undefined)).toBeNull();
    });

    it('purge les tickets expirés à l\'émission (borne mémoire)', () => {
        let t = 0;
        const store = new SseTicketStore({ ttlMs: 1_000, now: () => t });
        store.issue({ workspaceId: 'a', scopes: [] });
        store.issue({ workspaceId: 'b', scopes: [] });
        expect(store.size).toBe(2);
        t += 2_000;
        store.issue({ workspaceId: 'c', scopes: [] }); // déclenche le sweep
        expect(store.size).toBe(1);
    });
});
