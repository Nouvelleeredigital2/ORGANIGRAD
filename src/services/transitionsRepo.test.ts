import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du module supabase AVANT l'import du repo
vi.mock('../lib/supabase', () => {
    const channel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
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
            channel: vi.fn().mockReturnValue(channel),
            removeChannel: vi.fn(),
        },
    };
});

import { transitionsRepo } from './transitionsRepo';

describe('transitionsRepo', () => {
    beforeEach(() => vi.clearAllMocks());

    it('listRecent() retourne les transitions mappées', async () => {
        const list = await transitionsRepo.listRecent('ws1', 30);
        expect(list).toHaveLength(1);
        expect(list[0]).toEqual({
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
});
