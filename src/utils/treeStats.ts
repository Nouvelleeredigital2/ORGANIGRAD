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
 */
export const calculateBranchSize = (node: TreeNode): number => {
    let count = 1; // Count the node itself
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            count += calculateBranchSize(child);
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
