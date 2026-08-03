/**
 * Cache local des fiches RH de l'organigramme.
 *
 * NAMESPACÉ PAR WORKSPACE, comme `hybridNodeStore` : aucune fuite d'un
 * workspace vers un autre par le cache. Le mode hors-ligne (sans Supabase
 * configuré) utilise l'espace dédié `local`, où ce store n'est pas un cache
 * mais la persistance nominale.
 *
 * Remplace les clés globales `orgchart_deleted_ids` / `orgchart_agent_overrides`
 * de `storageService`, dont l'absence de cloisonnement faisait qu'une
 * suppression enregistrée sur une source s'appliquait à une autre.
 */
import type { Agent } from '../types/agent';

const BASE_KEY = 'organigrad_org_agents_v1';

/** Clé localStorage propre à un workspace (ou à l'espace hors-ligne). */
function keyFor(workspaceId: string | null | undefined): string {
    return `${BASE_KEY}::${workspaceId ?? 'local'}`;
}

function load(workspaceId: string | null | undefined): Agent[] {
    try {
        const raw = localStorage.getItem(keyFor(workspaceId));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Agent[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function save(workspaceId: string | null | undefined, agents: Agent[]): void {
    try {
        localStorage.setItem(keyFor(workspaceId), JSON.stringify(agents));
    } catch {
        /* quota / SSR — le cache est best-effort, l'appelant a déjà ses données */
    }
}

export const agentStore = {
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
