import { useCallback, useEffect, useRef, useState } from 'react';
import type { NodeStatus } from '../types/hybridNode';
import {
    OrchestratorClient,
    type SseStatusEvent,
    type OrchestratorGraphNode,
    type UserAuth,
    type LinkImportResult,
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
    /**
     * `local`      — aucun orchestrateur configuré, transitions simulées ;
     * `connecting` — orchestrateur configuré, sonde en cours ;
     * `connected`  — snapshot obtenu et flux ouvert ;
     * `degraded`   — flux SSE interrompu, données possiblement obsolètes ;
     * `failed`     — injoignable ou en erreur.
     *
     * `connecting` manquait : pendant la sonde, l'interface annonçait « Mode
     * local · transitions simulées » alors qu'un orchestrateur ÉTAIT configuré
     * et en cours de contact. Le chargement doit se distinguer de l'absence de
     * configuration, sinon un serveur lent se lit comme un serveur absent.
     */
    connectionState: 'local' | 'connecting' | 'connected' | 'degraded' | 'failed';
    nodes: OrchestratorGraphNode[];
    /** Client actif — exposé pour que le repo puisse router les écritures via l'orchestrateur. */
    client: OrchestratorClient | null;
    runNode: (id: string) => Promise<void>;
    runFlow: (id: string) => Promise<void>;
    approve: (id: string) => Promise<void>;
    reject: (id: string, feedback: string) => Promise<void>;
    reset: (id: string) => Promise<void>;
    /** Importe les bots Hermes/LINK comme des nœuds AGENT_IA (admin uniquement). */
    importLinkAgents: () => Promise<LinkImportResult>;
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
    const [connectionState, setConnectionState] = useState<OrchestratorBridge['connectionState']>('local');
    const [nodes, setNodes] = useState<OrchestratorGraphNode[]>([]);
    const [activeClient, setActiveClient] = useState<OrchestratorClient | null>(null);
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
                setConnectionState('local');
                return;
            }
            setConnectionState('connecting');
            const client = clientFactory
                ? clientFactory()
                : new OrchestratorClient({ baseUrl, apiKey, getUserAuth });
            clientRef.current = client;

            const reachable = await client.isReachable();
            if (cancelled) return;
            if (!reachable) {
                setConnected(false);
                setActiveClient(null);
                setConnectionState('failed');
                return;
            }
            try {
                const snapshot = await client.fetchGraph();
                if (cancelled) return;
                setNodes(snapshot);
                setConnected(true);
                setConnectionState('connected');
                setActiveClient(client);
                unsubscribe = client.subscribe(
                    (evt: SseStatusEvent) => {
                        setNodes((prev) => applyTransitionPatch(prev, evt));
                    },
                    () => {
                        if (!cancelled) setConnectionState('degraded');
                    },
                    // Reconnexion réussie : on ne reste pas « dégradé » à vie.
                    () => {
                        if (!cancelled) setConnectionState('connected');
                    },
                );
            } catch {
                setConnected(false);
                setActiveClient(null);
                setConnectionState('failed');
            }
        })();

        return () => {
            cancelled = true;
            setActiveClient(null);
            unsubscribe();
        };
    }, [baseUrl, apiKey, clientFactory, enabled, isConfigured, getUserAuth]);

    return {
        connected,
        connectionState,
        nodes,
        client: activeClient,
        runNode: async (id) => {
            await clientRef.current?.runNode(id);
        },
        runFlow: async (id) => {
            await clientRef.current?.runFlow(id);
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
        /**
         * Importe les bots Hermes/LINK comme des nœuds AGENT_IA (session
         * humaine admin requise côté serveur). Lève si l'orchestrateur n'est
         * pas configuré/joignable — le client doit gérer l'erreur.
         */
        importLinkAgents: async () => {
            if (!clientRef.current) throw new Error('ORCHESTRATOR_NOT_CONFIGURED');
            return clientRef.current.importLinkAgents();
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
