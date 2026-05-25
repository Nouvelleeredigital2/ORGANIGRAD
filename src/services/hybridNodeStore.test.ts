import { describe, it, expect, beforeEach } from 'vitest';
import { hybridNodeStore } from './hybridNodeStore';

describe('hybridNodeStore', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("retourne une liste vide quand le storage n'a rien (app vierge)", () => {
        expect(hybridNodeStore.list()).toEqual([]);
    });

    it('persiste et relit les nœuds sauvegardés', () => {
        hybridNodeStore.save([
            {
                id: 'custom',
                type: 'AGENT_IA',
                nom: 'X',
                roleTitre: 'Y',
                parentID: null,
                gradeId: 'E',
                status: 'IDLE',
            },
        ]);
        const list = hybridNodeStore.list();
        expect(list).toHaveLength(1);
        expect(list[0]!.id).toBe('custom');
    });

    it('reset() vide le storage', () => {
        hybridNodeStore.save([
            {
                id: 'x',
                type: 'AGENT_IA',
                nom: 'X',
                roleTitre: 'Y',
                parentID: null,
                gradeId: 'E',
                status: 'IDLE',
            },
        ]);
        expect(hybridNodeStore.list()).toHaveLength(1);
        hybridNodeStore.reset();
        expect(hybridNodeStore.list()).toEqual([]);
    });

    it('ignore le JSON corrompu et retourne []', () => {
        localStorage.setItem('organigrad_hybrid_nodes_v1', '{not json');
        expect(hybridNodeStore.list()).toEqual([]);
    });
});
