import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('../lib/supabase', () => {
    const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((...args: unknown[]) => {
            eqSpy(...args);
            return builder;
        }),
        order: vi.fn((...args: unknown[]) => {
            orderSpy(...args);
            return Promise.resolve({
                data: [
                    {
                        role: 'viewer',
                        workspace: {
                            id: 'ws-recette',
                            name: 'Recette',
                            slug: 'recette',
                            owner_id: 'user-owner',
                            created_at: '2026-08-05T00:00:00Z',
                            updated_at: '2026-08-05T00:00:00Z',
                        },
                    },
                ],
                error: null,
            });
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
        localStorage.clear();
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
});
