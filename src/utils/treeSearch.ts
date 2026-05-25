import type { TreeNode } from '../types/orgchart';

export interface SearchResultItem {
    id: string;
    nom: string;
    prenom: string;
    fonction: string;
    service: string;
    pole: string;
    path: string[];
}

/**
 * Flattens the tree and searches for the query.
 * Returns a list of matching agents with their path.
 */
export const searchTree = (nodes: TreeNode[], term: string): SearchResultItem[] => {
    if (!term || term.trim() === '') return [];

    const results: SearchResultItem[] = [];
    const lowerTerm = term.toLowerCase();

    const traverse = (currentNodes: TreeNode[], currentPath: string[]) => {
        for (const node of currentNodes) {
            const newPath = [...currentPath, node.id];

            const match =
                node.nom.toLowerCase().includes(lowerTerm) ||
                node.prenom.toLowerCase().includes(lowerTerm) ||
                node.fonction.toLowerCase().includes(lowerTerm) ||
                node.service.toLowerCase().includes(lowerTerm);

            if (match) {
                results.push({
                    id: node.id,
                    nom: node.nom,
                    prenom: node.prenom,
                    fonction: node.fonction,
                    service: node.service,
                    pole: node.pole,
                    path: newPath
                });
            }

            if (node.children) {
                traverse(node.children, newPath);
            }
        }
    };

    traverse(nodes, []);
    return results;
};
