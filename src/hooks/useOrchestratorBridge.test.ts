import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOrchestratorBridge } from './useOrchestratorBridge';
import { OrchestratorClient } from '../services/orchestratorService';

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
    it('mode brouillon : connected reste false quand l\'orchestrateur n\'est pas joignable', async () => {
        const client = makeFakeClient(false);
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: () => client }));
        await waitFor(() => expect(result.current.connected).toBe(false));
        expect(result.current.nodes).toEqual([]);
    });

    it('mode connecté : récupère le graphe et s\'abonne au flux', async () => {
        const client = makeFakeClient(true);
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: () => client }));
        await waitFor(() => expect(result.current.connected).toBe(true));
        expect(result.current.nodes).toHaveLength(1);
        expect(client.subscribe).toHaveBeenCalled();
    });

    it('expose les actions run/approve/reject/reset qui délèguent au client', async () => {
        const client = makeFakeClient(true);
        const { result } = renderHook(() => useOrchestratorBridge({ clientFactory: () => client }));
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
        const { result } = renderHook(() =>
            useOrchestratorBridge({ clientFactory: () => client, enabled: false }),
        );
        expect(result.current.connected).toBe(false);
        expect(client.isReachable).not.toHaveBeenCalled();
    });
});
