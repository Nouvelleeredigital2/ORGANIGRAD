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

    // Second pass: attach children to their parents
    agents.forEach(agent => {
        const id = String(agent.id).trim();
        const node = agentMap.get(id);
        if (!node) return;

        const parentId = agent.rattachementId ? String(agent.rattachementId).trim() : null;

        if (parentId && parentId !== "") {
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
