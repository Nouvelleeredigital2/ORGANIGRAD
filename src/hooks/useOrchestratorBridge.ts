import { useEffect, useRef, useState } from 'react';
import type { HybridNode, NodeStatus } from '../types/hybridNode';
import { OrchestratorClient, type SseStatusEvent } from '../services/orchestratorService';
import { useOrchestratorConfig } from './useOrchestratorConfig';

/**
 * Hook de pont entre la SPA et l'orchestrateur.
 *
 * Sondage initial → si l'orchestrateur répond, on bascule la source de vérité
 * sur lui (lecture via `/api/graph`, abonnement SSE pour le live).
 * S'il ne répond pas, on reste en mode brouillon (le caller continue d'utiliser
 * `hybridNodeStore`/localStorage comme avant).
 *
 * Volontairement séparé de `useOrgChartController` pour permettre l'opt-in
 * progressif et préserver les tests existants.
 */
export interface OrchestratorBridge {
    connected: boolean;
    nodes: HybridNode[];
    runNode: (id: string) => Promise<void>;
    approve: (id: string) => Promise<void>;
    reject: (id: string, feedback: string) => Promise<void>;
    reset: (id: string) => Promise<void>;
}

export interface UseOrchestratorBridgeOptions {
    baseUrl?: string;
    apiKey?: string;
    /** Permet l'injection en test. */
    clientFactory?: () => OrchestratorClient;
    /** Désactive la connexion (utile en mode brouillon explicite). */
    enabled?: boolean;
}

export function useOrchestratorBridge(
    opts: UseOrchestratorBridgeOptions = {},
): OrchestratorBridge {
    const [connected, setConnected] = useState(false);
    const [nodes, setNodes] = useState<HybridNode[]>([]);
    const clientRef = useRef<OrchestratorClient | null>(null);

    // Configuration persistée (Paramètres). Les options explicites priment.
    const { config, isConfigured } = useOrchestratorConfig();
    const baseUrl = opts.baseUrl ?? config.baseUrl;
    const apiKey = opts.apiKey ?? config.apiKey;

    useEffect(() => {
        if (opts.enabled === false) {
            setConnected(false);
            return;
        }
        // Sans config ni clientFactory de test → pas de tentative
        if (!opts.clientFactory && !(baseUrl && (apiKey || !isConfigured))) {
            setConnected(false);
            return;
        }
        const client = opts.clientFactory
            ? opts.clientFactory()
            : new OrchestratorClient({ baseUrl, apiKey });
        clientRef.current = client;

        let cancelled = false;
        let unsubscribe = () => {};

        (async () => {
            const reachable = await client.isReachable();
            if (cancelled) return;
            if (!reachable) {
                setConnected(false);
                return;
            }
            try {
                const snapshot = await client.fetchGraph();
                if (cancelled) return;
                setNodes(snapshot);
                setConnected(true);
                unsubscribe = client.subscribe((evt: SseStatusEvent) => {
                    setNodes((prev) => applyTransitionPatch(prev, evt));
                });
            } catch {
                setConnected(false);
            }
        })();

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [baseUrl, apiKey, opts.clientFactory, opts.enabled, isConfigured]);

    return {
        connected,
        nodes,
        runNode: async (id) => {
            await clientRef.current?.runNode(id);
        },
        approve: async (id) => {
            await clientRef.current?.approve(id);
        },
        reject: async (id, feedback) => {
            await clientRef.current?.reject(id, feedback);
        },
        reset: async (id) => {
            await clientRef.current?.reset(id);
        },
    };
}

function applyTransitionPatch(prev: HybridNode[], evt: SseStatusEvent): HybridNode[] {
    return prev.map((n) =>
        n.id === evt.nodeId ? { ...n, status: evt.to as NodeStatus } : n,
    );
}
