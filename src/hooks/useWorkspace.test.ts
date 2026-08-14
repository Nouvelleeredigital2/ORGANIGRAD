import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * useWorkspace doit filtrer workspace_members sur le user courant : la policy
 * « wm read members » expose les lignes de TOUS les co-membres des workspaces
 * où l'on est membre. Sans `.eq('user_id', …)`, chaque workspace multi-membres
 * apparaît en doublon et le rôle affiché est celui de la plus ancienne ligne
 * (l'owner) — le viewer se voyait owner dans l'UI.
 */

const eqSpy = vi.fn();
const orderSpy = vi.fn();

const WORKSPACE = {
    id: 'ws-recette',
    name: 'Recette',
    slug: 'recette',
    owner_id: 'user-owner',
    created_at: '2026-08-05T00:00:00Z',
    updated_at: '2026-08-05T00:00:00Z',
};

/**
 * Réponse mutable : les tests de revalidation ont besoin que la base « change »
 * entre deux appels, comme lorsqu'un administrateur rétrograde un membre depuis
 * un autre onglet.
 */
const reponse = vi.hoisted(() => ({
    lignes: [] as Array<{ role: string; workspace: unknown }>,
}));

vi.mock('../lib/supabase', () => {
    const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((...args: unknown[]) => {
            eqSpy(...args);
            return builder;
        }),
        order: vi.fn((...args: unknown[]) => {
            orderSpy(...args);
            return Promise.resolve({ data: reponse.lignes, error: null });
        }),
    };
    return {
        isSupabaseConfigured: true,
        supabase: { from: vi.fn(() => builder) },
    };
});

import { useWorkspace } from './useWorkspace';

describe('useWorkspace', () => {
    beforeEach(() => {
        eqSpy.mockClear();
        orderSpy.mockClear();
        localStorage.clear();
        reponse.lignes = [{ role: 'viewer', workspace: WORKSPACE }];
    });

    it("filtre les adhésions sur l'utilisateur courant (user_id)", async () => {
        const { result } = renderHook(() => useWorkspace('user-viewer'));
        await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
        expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-viewer');
    });

    it("expose le rôle de la ligne du user courant, pas celui d'un co-membre", async () => {
        const { result } = renderHook(() => useWorkspace('user-viewer'));
        await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
        expect(result.current.workspaces[0]).toMatchObject({ id: 'ws-recette', role: 'viewer' });
        expect(result.current.activeId).toBe('ws-recette');
    });

    it('renvoie une liste vide sans utilisateur', async () => {
        const { result } = renderHook(() => useWorkspace(undefined));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.workspaces).toEqual([]);
        expect(eqSpy).not.toHaveBeenCalled();
    });

    /**
     * P2-18 — multi-onglets. `refresh()` ne tournait qu'au montage : un onglet
     * laissé en arrière-plan gardait indéfiniment le rôle qu'il avait au
     * chargement. Un membre rétrogradé continuait d'y voir les commandes
     * d'administration (la RLS refusait bien l'écriture, mais l'interface
     * proposait des actions vouées à un 403 muet).
     */
    describe('revalidation au retour sur l’onglet', () => {
        // Le garde-fou anti-rafale compare des `Date.now()`. On pilote l'horloge
        // plutôt que d'attendre réellement 5 secondes.
        let decalage = 0;
        const vraiNow = Date.now.bind(Date);

        beforeEach(() => {
            decalage = 0;
            vi.spyOn(Date, 'now').mockImplementation(() => vraiNow() + decalage);
        });
        afterEach(() => vi.mocked(Date.now).mockRestore());

        /** Simule le retour sur un onglet passé en arrière-plan. */
        const revenirSurLOnglet = () => document.dispatchEvent(new Event('visibilitychange'));
        /** Avance l'horloge au-delà de la fenêtre anti-rafale. */
        const avancerAuDelaDuDelai = () => {
            decalage += 10_000;
        };

        it('reprend le rôle à jour après une rétrogradation faite ailleurs', async () => {
            const { result } = renderHook(() => useWorkspace('user-x'));
            await waitFor(() =>
                expect(result.current.workspaces[0]).toMatchObject({ role: 'viewer' }),
            );

            // Entre-temps, un administrateur promeut l'utilisateur depuis un
            // autre onglet — ou le rétrograde, le sens importe peu.
            reponse.lignes = [{ role: 'admin', workspace: WORKSPACE }];
            avancerAuDelaDuDelai();
            revenirSurLOnglet();

            await waitFor(() =>
                expect(result.current.workspaces[0]).toMatchObject({ role: 'admin' }),
            );
        });

        it("retire le workspace dont l'utilisateur a été exclu", async () => {
            const { result } = renderHook(() => useWorkspace('user-x'));
            await waitFor(() => expect(result.current.activeId).toBe('ws-recette'));

            reponse.lignes = [];
            avancerAuDelaDuDelai();
            revenirSurLOnglet();

            await waitFor(() => expect(result.current.workspaces).toEqual([]));
            expect(result.current.activeId).toBeNull();
        });

        it('ne relance pas la requête à chaque bascule (garde-fou anti-rafale)', async () => {
            const { result } = renderHook(() => useWorkspace('user-x'));
            await waitFor(() => expect(result.current.workspaces).toHaveLength(1));
            const appelsApresMontage = orderSpy.mock.calls.length;

            // Cinq allers-retours rapprochés : un alt-tab répété ne doit pas
            // déclencher une requête par bascule.
            for (let i = 0; i < 5; i++) revenirSurLOnglet();

            expect(orderSpy.mock.calls.length).toBe(appelsApresMontage);
        });

        it('ne revalide pas quand aucun utilisateur n’est connecté', async () => {
            const { result } = renderHook(() => useWorkspace(undefined));
            await waitFor(() => expect(result.current.loading).toBe(false));

            avancerAuDelaDuDelai();
            revenirSurLOnglet();

            expect(eqSpy).not.toHaveBeenCalled();
        });
    });
});
