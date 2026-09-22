import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOrchestratorBridge } from './useOrchestratorBridge';
import { OrchestratorClient } from '../services/orchestratorService';

/**
 * Fabrique STABLE entre deux rendus. Une fonction recréée à chaque rendu
 * (`clientFactory: () => client` inline) figure dans les dépendances de
 * l'effet : celui-ci se relançait donc à chaque changement d'état, resondait
 * l'orchestrateur et écrasait aussitôt un état intermédiaire comme
 * `degraded`. En production le hook est appelé sans options — les dépendances
 * y sont stables ; le test doit modéliser ce cas, pas un cas pathologique.
 */
function fabriqueStable(client: OrchestratorClient) {
    return () => client;
}

function makeFakeClient(reachable: boolean) {
    return {
        isReachable: vi.fn().mockResolvedValue(reachable),
        fetchGraph: vi.fn().mockResolvedValue([
            { id: 'a', type: 'AGENT_IA', nom: 'A', roleTitre: 'a', parentID: null, gradeId: 'E', status: 'IDLE' },
        ]),
        subscribe: vi.fn().mockReturnValue(() => {}),
        runNode: vi.fn().mockResolvedValue(undefined),
        approve: vi.fn().mockResolvedValue(undefined),
        reject: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
    } satisfies Partial<OrchestratorClient> as unknown as OrchestratorClient;
}

describe('useOrchestratorBridge', () => {
    it('signals a failed configured connection instead of local mode', async () => {
        const client = makeFakeClient(false);
        const fabrique = fabriqueStable(client);
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: fabrique }));
        await waitFor(() => expect(result.current.connectionState).toBe('failed'));
        expect(result.current.connected).toBe(false);
    });

    it('becomes degraded when the SSE subscription fails after the snapshot', async () => {
        let onError: ((event: Event) => void) | undefined;
        const client = makeFakeClient(true);
        const fabrique = fabriqueStable(client);
        client.subscribe = vi.fn((_onEvent, error) => {
            onError = error;
            return () => {};
        });
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: fabrique }));
        await waitFor(() => expect(result.current.connectionState).toBe('connected'));
        act(() => onError?.(new Event('error')));
        await waitFor(() => expect(result.current.connectionState).toBe('degraded'));
        expect(result.current.connected).toBe(true);
    });

    it('mode brouillon : connected reste false quand l\'orchestrateur n\'est pas joignable', async () => {
        const client = makeFakeClient(false);
        const fabrique = fabriqueStable(client);
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: fabrique }));
        await waitFor(() => expect(result.current.connected).toBe(false));
        expect(result.current.nodes).toEqual([]);
    });

    it('mode connecté : récupère le graphe et s\'abonne au flux', async () => {
        const client = makeFakeClient(true);
        const fabrique = fabriqueStable(client);
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: fabrique }));
        await waitFor(() => expect(result.current.connected).toBe(true));
        expect(result.current.nodes).toHaveLength(1);
        expect(client.subscribe).toHaveBeenCalled();
    });

    it('expose les actions run/approve/reject/reset qui délèguent au client', async () => {
        const client = makeFakeClient(true);
        const fabrique = fabriqueStable(client);
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: fabrique }));
        await waitFor(() => expect(result.current.connected).toBe(true));
        await act(async () => {
            await result.current.runNode('a');
            await result.current.approve('a');
            await result.current.reject('a', 'KO');
            await result.current.reset('a');
        });
        expect(client.runNode).toHaveBeenCalledWith('a');
        expect(client.approve).toHaveBeenCalledWith('a');
        expect(client.reject).toHaveBeenCalledWith('a', 'KO');
        expect(client.reset).toHaveBeenCalledWith('a');
    });

    it('enabled=false ne déclenche aucune connexion', () => {
        const client = makeFakeClient(true);
        const fabrique = fabriqueStable(client);
        const { result } = renderHook(() =>
            useOrchestratorBridge({ clientFactory: fabrique, enabled: false }),
        );
        expect(result.current.connected).toBe(false);
        expect(client.isReachable).not.toHaveBeenCalled();
    });

    /**
     * P2-17 — l'interface doit distinguer chargement, dégradé et échec. Sans
     * état `connecting`, la sonde s'affichait comme « Mode local · transitions
     * simulées » : un orchestrateur lent se lisait comme un orchestrateur
     * absent.
     */
    it('annonce « connecting » pendant la sonde, avant tout verdict', async () => {
        const client = makeFakeClient(true);
        const fabrique = fabriqueStable(client);
        let resoudre: (v: boolean) => void = () => {};
        client.isReachable = vi.fn(() => new Promise<boolean>((r) => { resoudre = r; }));

        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: fabrique }));

        await waitFor(() => expect(result.current.connectionState).toBe('connecting'));
        expect(result.current.connected).toBe(false);

        await act(async () => { resoudre(true); });
        await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    });

    it('revient à « connected » quand le flux SSE se rétablit', async () => {
        // Auparavant `degraded` etait un cul-de-sac : rien ne ramenait l'etat
        // a la normale, l'interface annoncait une reconnexion en cours
        // indefiniment — y compris une fois le flux revenu.
        let onError: ((e: Event) => void) | undefined;
        let onOpen: (() => void) | undefined;
        const client = makeFakeClient(true);
        const fabrique = fabriqueStable(client);
        client.subscribe = vi.fn((_onEvent, error, open) => {
            onError = error;
            onOpen = open;
            return () => {};
        });

        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: fabrique }));
        await waitFor(() => expect(result.current.connectionState).toBe('connected'));

        act(() => onError?.(new Event('error')));
        await waitFor(() => expect(result.current.connectionState).toBe('degraded'));

        act(() => onOpen?.());
        await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    });
});
