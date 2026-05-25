import type { TreeNode } from '../types/orgchart';

export const countVisibleAgents = (nodes: TreeNode[]): number => {
    let count = 0;

    const visit = (currentNodes: TreeNode[]) => {
        currentNodes.forEach((node) => {
            count += 1;
            if (node.children?.length) {
                visit(node.children);
            }
        });
    };

    visit(nodes);
    return count;
};
