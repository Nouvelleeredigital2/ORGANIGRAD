import type { TreeNode } from '../types/orgchart';

/**
 * Parses NBI string (e.g., "50 pts" or "10") into a number.
 */
export const parseNBI = (nbi?: string): number => {
    if (!nbi) return 0;
    const numericPart = nbi.replace(/[^\d]/g, '');
    return parseInt(numericPart, 10) || 0;
};

/**
 * Calculates the total number of agents in a branch (node + all descendants)
 *
 * `visited` est un filet de sécurité (défense en profondeur) contre un cycle
 * qui aurait échappé à la détection de `buildHierarchy` — sans lui, un arbre
 * corrompu ferait une récursion infinie / un dépassement de pile. Ne devrait
 * normalement jamais se déclencher : buildHierarchy() coupe déjà les cycles
 * avant de construire l'arbre.
 */
export const calculateBranchSize = (node: TreeNode, visited: Set<TreeNode> = new Set()): number => {
    if (visited.has(node)) {
        node.totalAgentsInBranch = 1;
        return 1;
    }
    visited.add(node);
    let count = 1; // Count the node itself
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            count += calculateBranchSize(child, visited);
        });
    }
    node.totalAgentsInBranch = count;
    return count;
};

/**
 * Recursively calculates stats for the entire tree
 */
export const computeTreeStats = (roots: TreeNode[]): void => {
    roots.forEach(root => calculateBranchSize(root));
};
