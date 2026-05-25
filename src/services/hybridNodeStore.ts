/**
 * Store local pour les HybridNode non-humains (IA + serveurs MCP).
 *
 * Persistance localStorage. Aucun seed simulé : l'application démarre vierge.
 * L'utilisateur crée ses nœuds via le NodeEditor, puis ils sont persistés.
 */
import type { HybridNode } from '../types/hybridNode';

const STORAGE_KEY = 'organigrad_hybrid_nodes_v1';

function load(): HybridNode[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as HybridNode[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function save(nodes: HybridNode[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
    } catch {
        /* quota / SSR — silently ignore */
    }
}

export const hybridNodeStore = {
    list: load,
    save,
    reset: () => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    },
};
