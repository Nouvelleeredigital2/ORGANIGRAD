import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { Agent } from '../types/agent';

/**
 * Audit P2 : changer d'URL (ou rafraîchir) pendant un fetch en vol laissait
 * deux appels concurrents ; le DERNIER À RÉSOUDRE gagnait, qui pouvait être
 * l'ancienne requête si la nouvelle était plus lente à résoudre.
 */

const agent = (id: string): Agent => ({
    id,
    nom: id,
    prenom: '',
    fonction: '',
    titre: '',
    service: '',
    pole: '',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
});

let resolvers: Array<(agents: Agent[]) => void> = [];

vi.mock('../services/api', () => ({
    fetchCSV: vi.fn(
        () =>
            new Promise<Agent[]>((resolve) => {
                resolvers.push(resolve);
            }),
    ),
}));

import { useGoogleSheets } from './useGoogleSheets';

describe('useGoogleSheets — course entre deux chargements', () => {
    it("le fetch le plus ANCIEN qui résout en dernier n'écrase pas le résultat le plus récent", async () => {
        resolvers = [];
        const { result, rerender } = renderHook(({ url }) => useGoogleSheets(url), {
            initialProps: { url: 'https://a.example/old.csv' },
        });

        await waitFor(() => expect(resolvers).toHaveLength(1));

        // Changement d'URL pendant que le premier fetch est encore en vol.
        rerender({ url: 'https://b.example/new.csv' });
        await waitFor(() => expect(resolvers).toHaveLength(2));

        // Le nouveau fetch (b) résout D'ABORD...
        act(() => resolvers[1]!([agent('b')]));
        await waitFor(() => expect(result.current.data.map((a) => a.id)).toEqual(['b']));

        // ...puis l'ANCIEN fetch (a) résout ensuite, en retard : il ne doit
        // PAS écraser le résultat déjà affiché pour la nouvelle URL.
        act(() => resolvers[0]!([agent('a')]));
        await new Promise((r) => setTimeout(r, 10));
        expect(result.current.data.map((a) => a.id)).toEqual(['b']);
    });
});
