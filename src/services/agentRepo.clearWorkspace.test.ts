import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Régression E2E du 2026-09-05 (élément L-82).
 *
 * Le trigger serveur `org_agents_reparent_children` est un `BEFORE DELETE FOR
 * EACH ROW`. Sur une suppression de masse, il tente de modifier une ligne que la
 * même commande supprime, et PostgreSQL refuse tout le lot (`27000`). Le bouton
 * « Reset » échouait donc sur tout organigramme ayant une hiérarchie, sans rien
 * supprimer.
 *
 * Ce que ce test verrouille : `clearWorkspace` coupe les rattachements AVANT de
 * supprimer, et dans cet ordre. Un test qui vérifierait seulement « une mise à
 * jour a eu lieu » laisserait passer la régression, puisque c'est la séquence qui
 * fait le correctif.
 */
const supabaseMock = vi.hoisted(() => {
    const appels: string[] = [];

    const query = {
        update: vi.fn(),
        delete: vi.fn(),
        eq: vi.fn(),
        not: vi.fn(),
        select: vi.fn(),
    };

    query.update.mockImplementation(() => { appels.push('update'); return query; });
    query.delete.mockImplementation(() => { appels.push('delete'); return query; });
    query.eq.mockReturnValue(query);
    query.not.mockReturnValue(query);

    return { query, appels, client: { from: vi.fn(() => query), rpc: vi.fn() } };
});

vi.mock('../lib/supabase', () => ({ supabase: supabaseMock.client }));
vi.mock('./agentStore', () => ({
    agentStore: { list: vi.fn(() => []), save: vi.fn(), reset: vi.fn() },
}));

import { agentRepo } from './agentRepo';

const ctx = { workspaceId: 'ws-1', mode: 'server' } as never;

describe('agentRepo.clearWorkspace — L-82', () => {
    beforeEach(() => {
        supabaseMock.appels.length = 0;
        supabaseMock.query.update.mockClear();
        supabaseMock.query.delete.mockClear();
        supabaseMock.query.not.mockClear();
    });

    it('coupe les rattachements AVANT de supprimer', async () => {
        supabaseMock.query.eq
            .mockReturnValueOnce(supabaseMock.query)
            .mockReturnValueOnce(supabaseMock.query);
        supabaseMock.query.not.mockResolvedValueOnce({ error: null } as never);
        supabaseMock.query.select.mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null } as never);

        const supprimes = await agentRepo.clearWorkspace(ctx);

        expect(supabaseMock.appels).toEqual(['update', 'delete']);
        expect(supprimes).toBe(2);
    });

    it('cible uniquement les fiches qui portent un rattachement', async () => {
        supabaseMock.query.not.mockResolvedValueOnce({ error: null } as never);
        supabaseMock.query.select.mockResolvedValueOnce({ data: [], error: null } as never);

        await agentRepo.clearWorkspace(ctx);

        expect(supabaseMock.query.update).toHaveBeenCalledWith({ rattachement_id: null });
        expect(supabaseMock.query.not).toHaveBeenCalledWith('rattachement_id', 'is', null);
    });

    it('ne supprime rien si la coupure des liens échoue', async () => {
        const panne = { message: 'refus', code: '23514' };
        supabaseMock.query.not.mockResolvedValueOnce({ error: panne } as never);

        await expect(agentRepo.clearWorkspace(ctx)).rejects.toMatchObject(panne);
        expect(supabaseMock.appels).toEqual(['update']);
    });
});
