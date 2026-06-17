/**
 * Store local pour les HybridNode non-humains (IA + serveurs MCP).
 *
 * Persistance localStorage, NAMESPACÉE PAR WORKSPACE (Priorité 3 — cloisonnement
 * multi-tenant). Chaque workspace possède sa propre clé : aucune fuite de nœuds
 * d'un workspace vers un autre via le cache local. Le mode offline (sans
 * workspace) utilise un espace dédié `local`.
 *
 * Aucun seed simulé : l'application démarre vierge.
 */
import type { HybridNode } from '../types/hybridNode';

const BASE_KEY = 'organigrad_hybrid_nodes_v1';

/** Clé localStorage propre à un workspace (ou à l'espace offline). */
function keyFor(workspaceId: string | null | undefined): string {
    return `${BASE_KEY}::${workspaceId ?? 'local'}`;
}

function load(workspaceId: string | null | undefined): HybridNode[] {
    try {
        const raw = localStorage.getItem(keyFor(workspaceId));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as HybridNode[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function save(workspaceId: string | null | undefined, nodes: HybridNode[]): void {
    try {
        localStorage.setItem(keyFor(workspaceId), JSON.stringify(nodes));
    } catch {
        /* quota / SSR — silently ignore */
    }
}

export const hybridNodeStore = {
    list: load,
    save,
    reset: (workspaceId: string | null | undefined) => {
        try {
            localStorage.removeItem(keyFor(workspaceId));
        } catch {
            /* ignore */
        }
    },
};
