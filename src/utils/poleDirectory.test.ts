import { describe, expect, it } from 'vitest';
import type { Agent } from '../types/agent';
import { buildPoleDirectory, getPoleKey } from './poleDirectory';

const makeAgent = (overrides: Partial<Agent>): Agent => ({
    id: crypto.randomUUID(),
    nom: 'Nom',
    prenom: 'Prenom',
    fonction: 'Agent',
    titre: '',
    service: 'Direction',
    pole: 'CABINET',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
    ...overrides,
});

describe('buildPoleDirectory', () => {
    it('groups agents by pole and sorts poles alphabetically', () => {
        const directory = buildPoleDirectory([
            makeAgent({ pole: 'RESSOURCES HUMAINES', nom: 'A' }),
            makeAgent({ pole: 'CABINET', nom: 'B' }),
            makeAgent({ pole: 'RESSOURCES HUMAINES', nom: 'C' }),
        ]);

        expect(directory).toEqual([
            { key: getPoleKey('CABINET'), pole: 'CABINET', count: 1 },
            { key: getPoleKey('RESSOURCES HUMAINES'), pole: 'RESSOURCES HUMAINES', count: 2 },
        ]);
    });
});
