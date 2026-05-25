import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore, NodeNotFoundError } from '../src/state/graphStore.js';
import { IllegalTransitionError } from '../src/domain/stateMachine.js';
import type { HybridNode } from '../src/domain/types.js';

const NODES: HybridNode[] = [
    {
        id: 'redacteur',
        type: 'AGENT_IA',
        nom: 'Rédacteur Campagne',
        roleTitre: 'Génère textes + visuels',
        parentID: null,
        gradeId: 'Expert',
        skills: ['rag', 'image-gen'],
        status: 'IDLE',
    },
    {
        id: 'brand-guard',
        type: 'SOFTWARE_MCP',
        nom: 'Charte Graphique Checker',
        roleTitre: 'Vérif. colorimétrique',
        parentID: 'redacteur',
        gradeId: 'Support',
        mcpConfig: { serverUrl: 'mcp://brand-guard.local', connectedTo: ['redacteur'] },
        status: 'IDLE',
    },
    {
        id: 'human',
        type: 'HUMAN',
        nom: 'Camille Roussel',
        roleTitre: 'Directrice Marketing',
        parentID: 'brand-guard',
        gradeId: 'Direction',
        status: 'IDLE',
    },
];

describe('GraphStore', () => {
    let store: GraphStore;

    beforeEach(() => {
        store = new GraphStore();
        store.load(NODES);
    });

    it('charge un graphe et liste tous les nœuds', () => {
        expect(store.list()).toHaveLength(3);
    });

    it('lit un nœud par id', () => {
        const n = store.get('redacteur');
        expect(n.nom).toBe('Rédacteur Campagne');
        expect(n.status).toBe('IDLE');
    });

    it('lève NodeNotFoundError si le nœud n\'existe pas', () => {
        expect(() => store.get('inexistant')).toThrowError(NodeNotFoundError);
    });

    it('applique une transition légale et met à jour le statut', () => {
        const next = store.applyTransition('redacteur', 'EXECUTING');
        expect(next.status).toBe('EXECUTING');
        expect(store.get('redacteur').status).toBe('EXECUTING');
    });

    it('refuse une transition illégale sans muter l\'état', () => {
        const before = store.get('redacteur').status;
        expect(() => store.applyTransition('redacteur', 'WAITING_HUMAN_APPROVAL')).toThrowError(
            IllegalTransitionError,
        );
        expect(store.get('redacteur').status).toBe(before);
    });

    it('lève NodeNotFoundError si on tente une transition sur un nœud inconnu', () => {
        expect(() => store.applyTransition('inexistant', 'EXECUTING')).toThrowError(
            NodeNotFoundError,
        );
    });

    it('émet un événement à chaque transition légale', () => {
        const events: Array<{ nodeId: string; from: string; to: string }> = [];
        store.onTransition((evt) => events.push({ nodeId: evt.nodeId, from: evt.from, to: evt.to }));

        store.applyTransition('redacteur', 'EXECUTING');
        store.applyTransition('redacteur', 'WAITING_HUMAN_APPROVAL');

        expect(events).toEqual([
            { nodeId: 'redacteur', from: 'IDLE', to: 'EXECUTING' },
            { nodeId: 'redacteur', from: 'EXECUTING', to: 'WAITING_HUMAN_APPROVAL' },
        ]);
    });

    it('n\'émet aucun événement pour une transition illégale', () => {
        const events: unknown[] = [];
        store.onTransition((e) => events.push(e));
        expect(() => store.applyTransition('redacteur', 'IDLE')).toThrow();
        expect(events).toEqual([]);
    });

    it('snapshot() expose une copie immuable du graphe', () => {
        const snap = store.snapshot();
        // Mutation sur la copie ne doit pas impacter le store
        snap[0]!.status = 'ERROR';
        expect(store.get(snap[0]!.id).status).toBe('IDLE');
    });
});
