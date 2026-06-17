import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGraphStore, NodeNotFoundError } from '../src/state/graphStore.js';
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

describe('InMemoryGraphStore', () => {
    let store: InMemoryGraphStore;

    beforeEach(() => {
        store = new InMemoryGraphStore();
        store.load(NODES);
    });

    it('charge un graphe et liste tous les nœuds', async () => {
        expect(await store.list()).toHaveLength(3);
    });

    it('lit un nœud par id', async () => {
        const n = await store.get('redacteur');
        expect(n.nom).toBe('Rédacteur Campagne');
        expect(n.status).toBe('IDLE');
    });

    it('rejette avec NodeNotFoundError si le nœud n\'existe pas', async () => {
        await expect(store.get('inexistant')).rejects.toThrowError(NodeNotFoundError);
    });

    it('applique une transition légale et met à jour le statut', async () => {
        const next = await store.applyTransition('redacteur', 'EXECUTING');
        expect(next.status).toBe('EXECUTING');
        expect((await store.get('redacteur')).status).toBe('EXECUTING');
    });

    it('refuse une transition illégale sans muter l\'état', async () => {
        const before = (await store.get('redacteur')).status;
        await expect(
            store.applyTransition('redacteur', 'WAITING_HUMAN_APPROVAL'),
        ).rejects.toThrowError(IllegalTransitionError);
        expect((await store.get('redacteur')).status).toBe(before);
    });

    it('rejette avec NodeNotFoundError si on tente une transition sur un nœud inconnu', async () => {
        await expect(store.applyTransition('inexistant', 'EXECUTING')).rejects.toThrowError(
            NodeNotFoundError,
        );
    });

    it('émet un événement à chaque transition légale', async () => {
        const events: Array<{ nodeId: string; from: string; to: string }> = [];
        store.onTransition((evt) => events.push({ nodeId: evt.nodeId, from: evt.from, to: evt.to }));

        await store.applyTransition('redacteur', 'EXECUTING');
        await store.applyTransition('redacteur', 'WAITING_HUMAN_APPROVAL');

        expect(events).toEqual([
            { nodeId: 'redacteur', from: 'IDLE', to: 'EXECUTING' },
            { nodeId: 'redacteur', from: 'EXECUTING', to: 'WAITING_HUMAN_APPROVAL' },
        ]);
    });

    it('n\'émet aucun événement pour une transition illégale', async () => {
        const events: unknown[] = [];
        store.onTransition((e) => events.push(e));
        await expect(store.applyTransition('redacteur', 'IDLE')).rejects.toThrow();
        expect(events).toEqual([]);
    });

    it('snapshot() expose une copie immuable du graphe', async () => {
        const snap = store.snapshot();
        // Mutation sur la copie ne doit pas impacter le store
        snap[0]!.status = 'ERROR';
        expect((await store.get(snap[0]!.id)).status).toBe('IDLE');
    });
});
