import { describe, it, expect, beforeEach } from 'vitest';
import { hybridNodeStore } from './hybridNodeStore';

const WS = 'ws-1';

const sample = (id: string) => ({
    id,
    type: 'AGENT_IA' as const,
    nom: 'X',
    roleTitre: 'Y',
    parentID: null,
    gradeId: 'E',
    status: 'IDLE' as const,
});

describe('hybridNodeStore (namespacé par workspace)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("retourne une liste vide quand le storage n'a rien (app vierge)", () => {
        expect(hybridNodeStore.list(WS)).toEqual([]);
    });

    it('persiste et relit les nœuds sauvegardés', () => {
        hybridNodeStore.save(WS, [sample('custom')]);
        const list = hybridNodeStore.list(WS);
        expect(list).toHaveLength(1);
        expect(list[0]!.id).toBe('custom');
    });

    it('reset() vide le storage du workspace', () => {
        hybridNodeStore.save(WS, [sample('x')]);
        expect(hybridNodeStore.list(WS)).toHaveLength(1);
        hybridNodeStore.reset(WS);
        expect(hybridNodeStore.list(WS)).toEqual([]);
    });

    it('cloisonne les workspaces : un workspace ne voit pas les nœuds d\'un autre', () => {
        hybridNodeStore.save('ws-a', [sample('a1')]);
        hybridNodeStore.save('ws-b', [sample('b1'), sample('b2')]);
        expect(hybridNodeStore.list('ws-a').map((n) => n.id)).toEqual(['a1']);
        expect(hybridNodeStore.list('ws-b')).toHaveLength(2);
        // reset d'un workspace n'affecte pas l'autre
        hybridNodeStore.reset('ws-a');
        expect(hybridNodeStore.list('ws-a')).toEqual([]);
        expect(hybridNodeStore.list('ws-b')).toHaveLength(2);
    });

    it('mode offline (workspace null) a son propre espace', () => {
        hybridNodeStore.save(null, [sample('offline')]);
        expect(hybridNodeStore.list(null)).toHaveLength(1);
        expect(hybridNodeStore.list(WS)).toEqual([]);
    });

    it('ignore le JSON corrompu et retourne []', () => {
        localStorage.setItem('organigrad_hybrid_nodes_v1::ws-1', '{not json');
        expect(hybridNodeStore.list(WS)).toEqual([]);
    });
});
