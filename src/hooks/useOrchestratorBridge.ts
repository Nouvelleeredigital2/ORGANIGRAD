import { useCallback, useEffect, useRef, useState } from 'react';
import type { NodeStatus } from '../types/hybridNode';
import {
    OrchestratorClient,
    type SseStatusEvent,
    type OrchestratorGraphNode,
    type UserAuth,
} from '../services/orchestratorService';
import { useOrchestratorConfig } from './useOrchestratorConfig';
import { useWorkspaceContext } from '../contexts/WorkspaceContext';
import { supabase } from '../lib/supabase';

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
    nodes: OrchestratorGraphNode[];
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
    const [nodes, setNodes] = useState<OrchestratorGraphNode[]>([]);
    const clientRef = useRef<OrchestratorClient | null>(null);

    // Configuration persistée (Paramètres). Les options explicites priment.
    const { config, isConfigured } = useOrchestratorConfig();
    const { activeId } = useWorkspaceContext();
    const baseUrl = opts.baseUrl ?? config.baseUrl;
    const apiKey = opts.apiKey ?? config.apiKey;
    const { clientFactory, enabled } = opts;

    // Session utilisateur (JWT) pour les actions humaines — l'orchestrateur exige
    // une session vérifiée pour approve/reject/reset.
    const getUserAuth = useCallback(async (): Promise<UserAuth | null> => {
        if (!supabase || !activeId) return null;
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { token, workspaceId: activeId } : null;
    }, [activeId]);

    useEffect(() => {
        const disabled =
            enabled === false ||
            // Sans config ni clientFactory de test → pas de tentative
            (!clientFactory && !(baseUrl && (apiKey || !isConfigured)));

        let cancelled = false;
        let unsubscribe = () => {};

        // Tous les setState se font dans ce callback async (jamais de setState
        // synchrone dans le corps de l'effet).
        (async () => {
            if (disabled) {
                setConnected(false);
                return;
            }
            const client = clientFactory
                ? clientFactory()
                : new OrchestratorClient({ baseUrl, apiKey, getUserAuth });
            clientRef.current = client;

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
    }, [baseUrl, apiKey, clientFactory, enabled, isConfigured, getUserAuth]);

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

function applyTransitionPatch(
    prev: OrchestratorGraphNode[],
    evt: SseStatusEvent,
): OrchestratorGraphNode[] {
    return prev.map((n) =>
        n.id === evt.nodeId ? { ...n, status: evt.to as NodeStatus } : n,
    );
}
