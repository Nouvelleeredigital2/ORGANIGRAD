import { describe, it, expect, vi } from 'vitest';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { GraphStore } from '../src/state/graphStore.js';
import type { HybridNode } from '../src/domain/types.js';
import type { RunResult } from '../src/mcp/mcpClient.js';

/**
 * Cas "Campagne Marketing" — 4 nœuds en chaîne :
 *   Rédacteur (AGENT_IA) → Brand-Guard (SOFTWARE_MCP) → Fact-Checker (SOFTWARE_MCP) → Humain
 *
 * Topologie via `parentID` : parent = nœud amont. La racine (Rédacteur) a parent null.
 * On instancie un client MCP factice qui retourne toujours { ok: true } pour
 * les nœuds non humains.
 */

const NODES: HybridNode[] = [
    {
        id: 'redacteur',
        type: 'AGENT_IA',
        nom: 'Rédacteur',
        roleTitre: 'Génère',
        parentID: null,
        gradeId: 'Expert',
        mcpConfig: { serverUrl: 'mcp://red.local', connectedTo: [] },
        status: 'IDLE',
    },
    {
        id: 'brand',
        type: 'SOFTWARE_MCP',
        nom: 'Brand-Guard',
        roleTitre: 'Vérif. couleurs',
        parentID: 'redacteur',
        gradeId: 'Support',
        mcpConfig: { serverUrl: 'mcp://brand.local', connectedTo: [] },
        status: 'IDLE',
    },
    {
        id: 'fact',
        type: 'SOFTWARE_MCP',
        nom: 'Fact-Checker',
        roleTitre: 'Vérif. RAG',
        parentID: 'brand',
        gradeId: 'Support',
        mcpConfig: { serverUrl: 'mcp://fact.local', connectedTo: [] },
        status: 'IDLE',
    },
    {
        id: 'human',
        type: 'HUMAN',
        nom: 'Directeur',
        roleTitre: 'Marketing',
        parentID: 'fact',
        gradeId: 'Direction',
        status: 'IDLE',
    },
];

function makeEngine(runImpl?: (node: HybridNode) => Promise<RunResult>) {
    const store = new GraphStore();
    store.load(NODES);
    const mcpClient = {
        runNode: vi
            .fn()
            .mockImplementation(runImpl ?? (async () => ({ ok: true, output: { livrable: 'ok' } }))),
    };
    const engine = new OrchestrationEngine(store, mcpClient);
    return { engine, store, mcpClient };
}

describe('OrchestrationEngine', () => {
    it('lance le flux et fige sur le nœud humain en WAITING_HUMAN_APPROVAL', async () => {
        const { engine, store } = makeEngine();

        await engine.runFlow('redacteur');

        // Tous les nœuds non-humains sont retournés en IDLE après exécution
        expect(store.get('redacteur').status).toBe('IDLE');
        expect(store.get('brand').status).toBe('IDLE');
        expect(store.get('fact').status).toBe('IDLE');
        // L'humain est figé en attente
        expect(store.get('human').status).toBe('WAITING_HUMAN_APPROVAL');
    });

    it('le flux n\'avance pas tant que l\'humain n\'a pas approuvé', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        expect(store.get('human').status).toBe('WAITING_HUMAN_APPROVAL');

        // Aucune action implicite ne fait sortir de WAITING_HUMAN_APPROVAL
        await new Promise((r) => setTimeout(r, 30));
        expect(store.get('human').status).toBe('WAITING_HUMAN_APPROVAL');
    });

    it('approve() fait passer le nœud humain en IDLE', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        engine.approve('human');
        expect(store.get('human').status).toBe('IDLE');
    });

    it('reject() avec feedback met l\'humain en ERROR', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        engine.reject('human', 'Trop générique');
        expect(store.get('human').status).toBe('ERROR');
    });

    it('un échec MCP met le nœud en ERROR et stoppe le flux', async () => {
        const { engine, store } = makeEngine(async (node) =>
            node.id === 'brand' ? { ok: false, error: 'couleur non conforme' } : { ok: true, output: null },
        );
        await engine.runFlow('redacteur');

        expect(store.get('redacteur').status).toBe('IDLE');
        expect(store.get('brand').status).toBe('ERROR');
        // Le flux n'a pas atteint Fact-Checker ni l'humain
        expect(store.get('fact').status).toBe('IDLE');
        expect(store.get('human').status).toBe('IDLE');
    });

    it('approve() sur un nœud qui n\'est pas en WAITING_HUMAN_APPROVAL lève une erreur', () => {
        const { engine } = makeEngine();
        expect(() => engine.approve('human')).toThrowError();
    });

    it('reset() ramène un nœud en ERROR à IDLE', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        engine.reject('human', 'KO');
        expect(store.get('human').status).toBe('ERROR');
        engine.reset('human');
        expect(store.get('human').status).toBe('IDLE');
    });

    it('runNode() lance un nœud isolé (bouton ⚡ Run)', async () => {
        const { engine, store } = makeEngine();
        await engine.runNode('redacteur');
        expect(store.get('redacteur').status).toBe('IDLE'); // EXECUTING puis IDLE
    });
});
