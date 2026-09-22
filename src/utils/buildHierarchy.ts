import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';
import { calculateBranchSize } from './treeStats';

/**
 * Convert a flat list of agents into a hierarchical tree based on rattachementId.
 * @param agents Flat array of Agent objects
 * @returns An array of root nodes (usually just one)
 */
export const buildHierarchy = (agents: Agent[]): TreeNode[] => {
    const agentMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // First pass: create a map of all agents as TreeNodes
    agents.forEach(agent => {
        const id = String(agent.id).trim();
        agentMap.set(id, { ...agent, id, children: [], totalAgentsInBranch: 0 });
    });

    // Détecte, pour un id donné, si suivre la chaîne `rattachementId` revient
    // un jour sur lui-même (auto-parent direct, ou cycle A→B→A plus long).
    //
    // Avant ce correctif, un tel cas n'était ni signalé ni bloqué : chaque
    // membre du cycle trouvait son "parent" dans `agentMap` et n'était donc
    // JAMAIS poussé dans `roots` — toute la branche disparaissait de
    // l'organigramme sans le moindre diagnostic, alors que les données
    // existent bel et bien (import CSV distant non contrôlé côté client).
    // Audit P2.
    const parentIdOf = (id: string): string | null => {
        const raw = agentMap.get(id)?.rattachementId;
        const p = raw ? String(raw).trim() : null;
        return p && p !== '' ? p : null;
    };
    const isCyclic = (startId: string): boolean => {
        const seen = new Set<string>([startId]);
        let current = parentIdOf(startId);
        while (current) {
            if (seen.has(current)) return true;
            seen.add(current);
            current = parentIdOf(current);
        }
        return false;
    };

    // Second pass: attach children to their parents
    agents.forEach(agent => {
        const id = String(agent.id).trim();
        const node = agentMap.get(id);
        if (!node) return;

        const parentId = agent.rattachementId ? String(agent.rattachementId).trim() : null;

        // Cycle détecté : on coupe le lien plutôt que de laisser le nœud (et
        // toute sa branche) disparaître silencieusement. Il redevient racine,
        // visible — c'est un signal qu'il faut corriger la donnée source.
        if (parentId && parentId !== "" && !isCyclic(id)) {
            const parent = agentMap.get(parentId);
            if (parent) {
                if (!parent.children) parent.children = [];
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        } else {
            roots.push(node);
        }
    });

    // Third pass: calculate recursive branch sizes
    roots.forEach(root => calculateBranchSize(root));

    return roots;
};
