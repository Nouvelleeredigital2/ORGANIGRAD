import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du module supabase AVANT l'import du repo.
//
// Le faux channel reproduit les deux comportements de supabase-js qui font le
// piège : `channel(topic)` rend l'instance EXISTANTE, et `.on()` après
// `.subscribe()` lève. Un mock complaisant (`on: mockReturnThis()`) laisserait
// passer la régression que ce fichier est censé garder.
const { mockChannels } = vi.hoisted(() => ({
    mockChannels: new Map<string, { topic: string; isSubscribed: boolean }>(),
}));

vi.mock('../lib/supabase', () => {
    const channel = (topic: string) => {
        const existant = mockChannels.get(topic);
        if (existant) return existant as never;
        const nouveau = {
            topic,
            isSubscribed: false,
            // Arguments volontairement non déclarés : seul l'ordre des appels
            // compte ici, et supabase-js les passe quoi qu'il arrive.
            on() {
                if (this.isSubscribed) {
                    throw new Error(
                        `cannot add \`postgres_changes\` callbacks for realtime channel \`${topic}\` after \`subscribe()\`.`,
                    );
                }
                return this;
            },
            subscribe() {
                this.isSubscribed = true;
                return this;
            },
        };
        mockChannels.set(topic, nouveau);
        return nouveau as never;
    };
    const from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
            data: [
                {
                    id: 't1',
                    workspace_id: 'ws1',
                    node_id: 'n1',
                    from_status: 'IDLE',
                    to_status: 'EXECUTING',
                    actor_kind: 'user',
                    actor_id: 'u1',
                    payload: null,
                    created_at: '2026-05-17T10:00:00Z',
                },
            ],
            error: null,
        }),
    });
    return {
        supabase: {
            from,
            channel,
            removeChannel: (c: { topic: string }) => {
                mockChannels.delete(c.topic);
            },
        },
    };
});

import { transitionsRepo } from './transitionsRepo';
import { _reinitialiserRegistre } from './realtimeShared';

describe('transitionsRepo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _reinitialiserRegistre();
        mockChannels.clear();
    });

    it('listRecent() retourne les transitions mappées', async () => {
        const { rows, error } = await transitionsRepo.listRecent('ws1', 30);
        expect(error).toBeUndefined();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            id: 't1',
            nodeId: 'n1',
            from: 'IDLE',
            to: 'EXECUTING',
            actorKind: 'user',
            actorId: 'u1',
            payload: null,
            timestamp: new Date('2026-05-17T10:00:00Z').getTime(),
        });
    });

    it('subscribe() retourne une fonction de cleanup', () => {
        const handler = vi.fn();
        const off = transitionsRepo.subscribe('ws1', handler);
        expect(typeof off).toBe('function');
        off();
    });

    /**
     * `node_transitions` n'a qu'un seul consommateur (ActivityLog), donc le
     * crash « .on() après .subscribe() » ne s'y est jamais manifesté. Le motif
     * y était pourtant identique à celui qui a fait tomber la SPA sur
     * `hybrid_nodes`. Ces tests ferment le trou avant qu'un second consommateur
     * — ou un simple remontage — ne le rouvre.
     */
    it("deux abonnés sur le même workspace ne rebranchent pas le channel", () => {
        expect(() => transitionsRepo.subscribe('ws1', vi.fn())).not.toThrow();
        expect(() => transitionsRepo.subscribe('ws1', vi.fn())).not.toThrow();
        expect(mockChannels.size).toBe(1);
    });

    it('ferme le channel au départ du dernier abonné seulement', () => {
        const offA = transitionsRepo.subscribe('ws1', vi.fn());
        const offB = transitionsRepo.subscribe('ws1', vi.fn());

        offA();
        expect(mockChannels.has('node_transitions:ws1')).toBe(true);
        offB();
        expect(mockChannels.has('node_transitions:ws1')).toBe(false);
    });

    it('isole les workspaces : un channel par workspace', () => {
        transitionsRepo.subscribe('ws1', vi.fn());
        transitionsRepo.subscribe('ws2', vi.fn());
        expect([...mockChannels.keys()].sort()).toEqual([
            'node_transitions:ws1',
            'node_transitions:ws2',
        ]);
    });
});
