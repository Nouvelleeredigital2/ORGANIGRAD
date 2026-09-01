import { describe, it, expect } from 'vitest';
import { buildHierarchy } from './buildHierarchy';
import type { Agent } from '../types/agent';

const agent = (overrides: Partial<Agent> & Pick<Agent, 'id'>): Agent => ({
    nom: 'Nom',
    prenom: 'Prenom',
    fonction: 'Fonction',
    titre: 'Titre',
    service: 'Service',
    pole: 'Pole',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
    ...overrides,
});

describe('buildHierarchy', () => {
    it("construit un arbre normal à partir d'une hiérarchie valide", () => {
        const roots = buildHierarchy([
            agent({ id: 'a', rattachementId: null }),
            agent({ id: 'b', rattachementId: 'a' }),
            agent({ id: 'c', rattachementId: 'b' }),
        ]);
        expect(roots).toHaveLength(1);
        expect(roots[0]!.id).toBe('a');
        expect(roots[0]!.children?.[0]!.id).toBe('b');
        expect(roots[0]!.children?.[0]!.children?.[0]!.id).toBe('c');
        expect(roots[0]!.totalAgentsInBranch).toBe(3);
    });

    // Audit P2 : avant le correctif, un agent auto-parenté disparaissait
    // silencieusement (jamais poussé dans `roots`, jamais l'enfant d'un
    // autre nœud réel) — aucune erreur, juste une fiche invisible.
    it("rend visible (en racine) un agent auto-parenté au lieu de le faire disparaître", () => {
        const roots = buildHierarchy([agent({ id: 'self', rattachementId: 'self' })]);
        expect(roots.map((r) => r.id)).toEqual(['self']);
        expect(roots[0]!.totalAgentsInBranch).toBe(1);
    });

    it('rend visibles A et B au lieu de faire disparaître les deux branches (cycle A→B→A)', () => {
        const roots = buildHierarchy([
            agent({ id: 'a', rattachementId: 'b' }),
            agent({ id: 'b', rattachementId: 'a' }),
        ]);
        // Chaque membre d'un cycle mutuel se détecte indépendamment et
        // devient racine : les deux redeviennent visibles (aucune donnée
        // perdue), plutôt que de disparaître tous les deux silencieusement.
        expect(roots.map((r) => r.id).sort()).toEqual(['a', 'b']);
    });

    it('rend visible un cycle plus long A→B→C→A', () => {
        const roots = buildHierarchy([
            agent({ id: 'a', rattachementId: 'c' }),
            agent({ id: 'b', rattachementId: 'a' }),
            agent({ id: 'c', rattachementId: 'b' }),
        ]);
        expect(roots.length).toBeGreaterThanOrEqual(1);
        // Ne doit pas boucler indéfiniment (le test lui-même terminerait en
        // timeout sinon) et doit conserver les 3 agents quelque part dans
        // l'arbre visible.
        const totalNodes = (n: (typeof roots)[number]): number =>
            1 + (n.children ?? []).reduce((acc, c) => acc + totalNodes(c), 0);
        const total = roots.reduce((acc, r) => acc + totalNodes(r), 0);
        expect(total).toBe(3);
    });

    it('un rattachement vers un id inexistant devient racine (comportement existant)', () => {
        const roots = buildHierarchy([agent({ id: 'orphan', rattachementId: 'ne-existe-pas' })]);
        expect(roots.map((r) => r.id)).toEqual(['orphan']);
    });
});
