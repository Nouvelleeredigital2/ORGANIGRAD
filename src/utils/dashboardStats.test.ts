import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../types/orgchart';
import { countVisibleAgents } from './dashboardStats';

const makeNode = (id: string, children: TreeNode[] = []): TreeNode => ({
  id,
  nom: `Nom ${id}`,
  prenom: `Prenom ${id}`,
  fonction: 'Fonction',
  titre: '',
  service: '',
  pole: '',
  rattachementId: null,
  gradeStyle: 'Agent',
  typeTemps: 'Temps complet',
  children,
});

describe('countVisibleAgents', () => {
  it('counts each visible node exactly once across multiple roots', () => {
    const tree: TreeNode[] = [
      makeNode('1', [makeNode('2'), makeNode('3')]),
      makeNode('4', [makeNode('5')]),
    ];

    expect(countVisibleAgents(tree)).toBe(5);
  });
});
