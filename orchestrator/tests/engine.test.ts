import { describe, it, expect, vi } from 'vitest';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { InMemoryGraphStore } from '../src/state/graphStore.js';
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
    const store = new InMemoryGraphStore();
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
        expect((await store.get('redacteur')).status).toBe('IDLE');
        expect((await store.get('brand')).status).toBe('IDLE');
        expect((await store.get('fact')).status).toBe('IDLE');
        // L'humain est figé en attente
        expect((await store.get('human')).status).toBe('WAITING_HUMAN_APPROVAL');
    });

    it('le flux n\'avance pas tant que l\'humain n\'a pas approuvé', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        expect((await store.get('human')).status).toBe('WAITING_HUMAN_APPROVAL');

        // Aucune action implicite ne fait sortir de WAITING_HUMAN_APPROVAL
        await new Promise((r) => setTimeout(r, 30));
        expect((await store.get('human')).status).toBe('WAITING_HUMAN_APPROVAL');
    });

    it('approve() fait passer le nœud humain en IDLE', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        await engine.approve('human');
        expect((await store.get('human')).status).toBe('IDLE');
    });

    it('reject() avec feedback met l\'humain en ERROR', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        await engine.reject('human', 'Trop générique');
        expect((await store.get('human')).status).toBe('ERROR');
    });

    it('un échec MCP met le nœud en ERROR et stoppe le flux', async () => {
        const { engine, store } = makeEngine(async (node) =>
            node.id === 'brand' ? { ok: false, error: 'couleur non conforme' } : { ok: true, output: null },
        );
        await engine.runFlow('redacteur');

        expect((await store.get('redacteur')).status).toBe('IDLE');
        expect((await store.get('brand')).status).toBe('ERROR');
        // Le flux n'a pas atteint Fact-Checker ni l'humain
        expect((await store.get('fact')).status).toBe('IDLE');
        expect((await store.get('human')).status).toBe('IDLE');
    });

    it('approve() sur un nœud qui n\'est pas en WAITING_HUMAN_APPROVAL rejette', async () => {
        const { engine } = makeEngine();
        await expect(engine.approve('human')).rejects.toThrowError();
    });

    it('reset() ramène un nœud en ERROR à IDLE', async () => {
        const { engine, store } = makeEngine();
        await engine.runFlow('redacteur');
        await engine.reject('human', 'KO');
        expect((await store.get('human')).status).toBe('ERROR');
        await engine.reset('human');
        expect((await store.get('human')).status).toBe('IDLE');
    });

    it('runNode() lance un nœud isolé (bouton ⚡ Run)', async () => {
        const { engine, store } = makeEngine();
        await engine.runNode('redacteur');
        expect((await store.get('redacteur')).status).toBe('IDLE'); // EXECUTING puis IDLE
    });

    it('runFlow() renvoie ok:true + waitingHumanAt au nœud humain', async () => {
        const { engine } = makeEngine();
        const r = await engine.runFlow('redacteur');
        expect(r).toMatchObject({ ok: true, waitingHumanAt: 'human' });
    });

    it('runFlow() renvoie ok:false + stoppedAt sur échec MCP', async () => {
        const { engine } = makeEngine(async (node) =>
            node.id === 'brand' ? { ok: false, error: 'ko' } : { ok: true, output: null },
        );
        const r = await engine.runFlow('redacteur');
        expect(r).toMatchObject({ ok: false, stoppedAt: 'brand', error: 'ko' });
    });

    it('resumeFromChildOf() relance la chaîne depuis l\'aval', async () => {
        const { engine } = makeEngine();
        const r = await engine.resumeFromChildOf('redacteur'); // enfant = brand
        expect(r?.ok).toBe(true);
        expect(r?.waitingHumanAt).toBe('human');
    });

    it('resumeFromChildOf() renvoie null sans aval', async () => {
        const { engine } = makeEngine();
        expect(await engine.resumeFromChildOf('human')).toBeNull();
    });

    it('runFlow() détecte un cycle et interrompt le flux au lieu de boucler', async () => {
        // Cycle A→B→A : rien ne l'empêche à l'écriture (dto/migrations ne
        // contrôlent que le workspace du parent), le moteur doit donc se
        // protéger lui-même — audit 2026-08-29, P1.
        const store = new InMemoryGraphStore();
        store.load([
            {
                id: 'a',
                type: 'AGENT_IA',
                nom: 'A',
                roleTitre: 'a',
                parentID: 'b',
                gradeId: 'Expert',
                mcpConfig: { serverUrl: 'mcp://a.local', connectedTo: [] },
                status: 'IDLE',
            },
            {
                id: 'b',
                type: 'SOFTWARE_MCP',
                nom: 'B',
                roleTitre: 'b',
                parentID: 'a',
                gradeId: 'Support',
                mcpConfig: { serverUrl: 'mcp://b.local', connectedTo: [] },
                status: 'IDLE',
            },
        ]);
        const mcpClient = {
            runNode: vi.fn().mockResolvedValue({ ok: true, output: null }),
        };
        const engine = new OrchestrationEngine(store, mcpClient);

        const r = await engine.runFlow('a');

        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/cycle/i);
        // Chaque nœud n'a été exécuté qu'une seule fois — pas de boucle.
        expect(mcpClient.runNode).toHaveBeenCalledTimes(2);
    });

    it("runFlow() détecte l'auto-parent (nœud son propre amont)", async () => {
        const store = new InMemoryGraphStore();
        store.load([
            {
                id: 'self',
                type: 'AGENT_IA',
                nom: 'Self',
                roleTitre: 's',
                parentID: 'self',
                gradeId: 'Expert',
                mcpConfig: { serverUrl: 'mcp://self.local', connectedTo: [] },
                status: 'IDLE',
            },
        ]);
        const mcpClient = {
            runNode: vi.fn().mockResolvedValue({ ok: true, output: null }),
        };
        const engine = new OrchestrationEngine(store, mcpClient);

        const r = await engine.runFlow('self');

        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/cycle/i);
        expect(mcpClient.runNode).toHaveBeenCalledTimes(1);
    });
});
