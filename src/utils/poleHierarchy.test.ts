import { describe, expect, it } from 'vitest';
import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';
import { buildPoleHierarchy } from './poleHierarchy';

const makeAgent = (overrides: Partial<Agent>): Agent => ({
    id: crypto.randomUUID(),
    nom: 'Nom',
    prenom: 'Prenom',
    fonction: 'Agent',
    titre: '',
    service: 'Direction',
    pole: 'RESSOURCES HUMAINES',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
    ...overrides,
});

const findNode = (nodes: TreeNode[], predicate: (node: TreeNode) => boolean): TreeNode | null => {
    for (const node of nodes) {
        if (predicate(node)) {
            return node;
        }

        const match = node.children ? findNode(node.children, predicate) : null;
        if (match) {
            return match;
        }
    }

    return null;
};

describe('buildPoleHierarchy', () => {
    it('infers the RH organigram from source order and leadership roles', () => {
        const tree = buildPoleHierarchy([
            makeAgent({ id: 'elina', nom: 'ETCHETTO', prenom: 'Elina', fonction: 'Directrice', gradeStyle: 'Direction', service: 'Direction' }),
            makeAgent({ id: 'stelly', nom: 'ASDRUBAL', prenom: 'Stelly', fonction: 'Assistante de Direction', gradeStyle: 'Support', service: 'Secrétariat' }),
            makeAgent({ id: 'fabienne', nom: 'PIERRE', prenom: 'Fabienne', fonction: "Chargée d'accueil", gradeStyle: 'Support', service: 'Accueil / Gestion' }),
            makeAgent({ id: 'leila', nom: 'BENAHMED', prenom: 'Leila', fonction: 'Chargée de finances RH', gradeStyle: 'Expert', service: 'Finances / Études' }),
            makeAgent({ id: 'yann', nom: 'CHRISTMANN', prenom: 'Yann', fonction: 'Conseiller prévention', gradeStyle: 'Expert', service: 'Prévention' }),
            makeAgent({ id: 'edith', nom: 'DROIT', prenom: 'Edith', fonction: 'Responsable', gradeStyle: 'Responsable', service: 'Développement RH' }),
            makeAgent({ id: 'martial', nom: 'LEFEBVRE', prenom: 'Martial', fonction: 'Chargé de recrutement', gradeStyle: 'Expert', service: 'Recrutement' }),
            makeAgent({ id: 'salma', nom: 'SABONI', prenom: 'Salma', fonction: 'Chargée de recrutement', gradeStyle: 'Expert', service: 'Recrutement' }),
            makeAgent({ id: 'nathalie', nom: 'SEGONDS', prenom: 'Nathalie', fonction: 'Responsable', gradeStyle: 'Responsable', service: 'Carrière Paie' }),
            makeAgent({ id: 'sandrine', nom: 'AUBINEAU', prenom: 'Sandrine', fonction: 'Gestionnaire référente', gradeStyle: 'Agent', service: 'Carrière Paie' }),
            makeAgent({ id: 'lomig', nom: 'COURTOIS', prenom: 'Lomig', fonction: 'Gestionnaire', gradeStyle: 'Agent', service: 'Carrière Paie' }),
        ]);

        expect(tree).toHaveLength(1);
        expect(tree[0]!.id).toBe('elina');

        const edith = findNode(tree, (node) => node.id === 'edith');
        const nathalie = findNode(tree, (node) => node.id === 'nathalie');
        const martial = findNode(tree, (node) => node.id === 'martial');
        const salma = findNode(tree, (node) => node.id === 'salma');
        const sandrine = findNode(tree, (node) => node.id === 'sandrine');

        expect(tree[0]!.children?.map((child) => child.id)).toContain('edith');
        expect(tree[0]!.children?.map((child) => child.id)).toContain('nathalie');
        expect(edith?.children?.map((child) => child.id)).toEqual(['martial', 'salma']);
        expect(nathalie?.children?.map((child) => child.id)).toEqual(['sandrine', 'lomig']);
        expect(martial?.rattachementId).toBe('edith');
        expect(salma?.rattachementId).toBe('edith');
        expect(sandrine?.rattachementId).toBe('nathalie');
    });

    /**
     * Risque couvert : l'heuristique écrasait TOUS les rattachements, y compris
     * ceux saisis explicitement. Une hiérarchie corrigée à la main était donc
     * réécrite au rendu suivant, et dépendait de l'ordre des lignes.
     */
    it('respecte le rattachement explicite au lieu de le déduire', () => {
        const tree = buildPoleHierarchy([
            // L'ordre est volontairement inverse de la hiérarchie déclarée.
            makeAgent({ id: 'agent', nom: 'DUPONT', fonction: 'Gestionnaire', gradeStyle: 'Agent', rattachementId: 'chef' }),
            makeAgent({ id: 'chef', nom: 'MARTIN', fonction: 'Chef de service', gradeStyle: 'Responsable', rattachementId: 'dg' }),
            makeAgent({ id: 'dg', nom: 'LEROY', fonction: 'Directeur général', gradeStyle: 'Direction', rattachementId: null }),
        ]);

        expect(tree).toHaveLength(1);
        expect(tree[0]!.id).toBe('dg');
        expect(tree[0]!.children?.map((c) => c.id)).toEqual(['chef']);

        const chef = findNode(tree, (n) => n.id === 'chef');
        expect(chef?.children?.map((c) => c.id)).toEqual(['agent']);
    });
});
