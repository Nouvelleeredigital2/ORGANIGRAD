import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../types/orgchart';
import { findAgentPath } from './treeSearch';

const makeNode = (id: string, children?: TreeNode[]): TreeNode => ({
    id,
    nom: `Nom-${id}`,
    prenom: 'Prenom',
    fonction: 'Agent',
    titre: '',
    service: 'Direction',
    pole: 'RESSOURCES HUMAINES',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
    children,
});

/**
 * Le chemin retourné alimente `highlightedPath`, qui déplie chaque nœud qu'il
 * contient (cf. OrgChartNode). Il doit donc inclure TOUS les ancêtres, sans quoi
 * le bouton « Voir dans l'organigramme » désigne un agent resté replié.
 */
describe('findAgentPath', () => {
    const tree: TreeNode[] = [
        makeNode('dg', [
            makeNode('dir-a', [makeNode('chef-1'), makeNode('chef-2')]),
            makeNode('dir-b'),
        ]),
        makeNode('autre-racine'),
    ];

    it('retourne la chaîne complète racine → agent', () => {
        expect(findAgentPath(tree, 'chef-2')).toEqual(['dg', 'dir-a', 'chef-2']);
    });

    it('retourne le seul identifiant pour un nœud racine', () => {
        expect(findAgentPath(tree, 'autre-racine')).toEqual(['autre-racine']);
    });

    it('retourne null pour un agent absent de l’arbre', () => {
        expect(findAgentPath(tree, 'inconnu')).toBeNull();
    });
});
