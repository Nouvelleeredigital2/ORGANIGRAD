import { describe, it, expect, vi } from 'vitest';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { NodeNotFoundError, type GraphStore, type TransitionEvent } from '../src/state/graphStore.js';
import { transition, type NodeStatus, IllegalTransitionError } from '../src/domain/stateMachine.js';
import type { HybridNode, JsonObject } from '../src/domain/types.js';
import type { RunResult } from '../src/mcp/mcpClient.js';

/**
 * Tests du moteur face à un store RÉELLEMENT asynchrone.
 *
 * Objectif : prouver que l'`OrchestrationEngine` attend (`await`) chaque
 * lecture/écriture du store — y compris les écritures qui simulent un INSERT
 * SQL — avant de poursuivre ou de répondre. Avant le refactor, le moteur
 * consommait le store de façon synchrone (cast `as never`), si bien que les
 * Promises d'écriture n'étaient jamais attendues : une réponse de succès
 * pouvait être renvoyée avant la fin de la transaction.
 *
 * Le `DelayedAsyncStore` ci-dessous reproduit les caractéristiques d'un store
 * Postgres : chaque méthode rend la main au micro-task loop (await) et peut
 * être configurée pour échouer (échec SQL) — sans dépendance réseau réelle.
 */

const NODES: HybridNode[] = [
    {
        id: 'agent',
        type: 'AGENT_IA',
        nom: 'Agent',
        roleTitre: 'Exécute',
        parentID: null,
        gradeId: 'Expert',
        mcpConfig: { serverUrl: 'mcp://agent.local', connectedTo: [] },
        status: 'IDLE',
    },
];

/** Store asynchrone instrumenté : journalise les opérations et leur ordre. */
class DelayedAsyncStore implements GraphStore {
    private nodes = new Map<string, HybridNode>();
    private listeners = new Set<(evt: TransitionEvent) => void>();
    /** Nombre d'écritures en cours (doit être 0 quand le moteur a fini). */
    inFlightWrites = 0;
    /** Journal d'ordre : 'write:start', 'write:commit', 'mcp', etc. */
    readonly log: string[] = [];
    /** Si défini, applyTransition rejette quand to === failOn (simule échec SQL). */
    failOn: NodeStatus | null = null;

    constructor(seed: HybridNode[]) {
        for (const n of seed) this.nodes.set(n.id, { ...n });
    }

    private tick() {
        return new Promise<void>((r) => setTimeout(r, 0));
    }

    async get(id: string): Promise<HybridNode> {
        await this.tick();
        const n = this.nodes.get(id);
        if (!n) throw new NodeNotFoundError(id);
        return { ...n };
    }

    async list(): Promise<readonly HybridNode[]> {
        await this.tick();
        return [...this.nodes.values()].map((n) => ({ ...n }));
    }

    async applyTransition(nodeId: string, to: NodeStatus, payload?: JsonObject): Promise<HybridNode> {
        this.inFlightWrites++;
        this.log.push(`write:start:${to}`);
        try {
            await this.tick();
            const node = this.nodes.get(nodeId);
            if (!node) throw new NodeNotFoundError(nodeId);
            const next = transition(node.status, to); // lève IllegalTransitionError si refusé
            if (this.failOn === to) {
                throw new Error(`ÉCHEC SQL simulé sur transition → ${to}`);
            }
            const updated = { ...node, status: next };
            this.nodes.set(nodeId, updated);
            const evt: TransitionEvent = {
                nodeId,
                from: node.status,
                to: next,
                timestamp: 0,
                payload,
                nodeSnapshot: { ...updated },
            };
            for (const fn of this.listeners) fn(evt);
            this.log.push(`write:commit:${to}`);
            return updated;
        } finally {
            this.inFlightWrites--;
        }
    }

    onTransition(listener: (evt: TransitionEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Helper test : statut courant sans passer par get(). */
    statusOf(id: string): NodeStatus | undefined {
        return this.nodes.get(id)?.status;
    }
}

function makeEngine(store: DelayedAsyncStore, runImpl?: (n: HybridNode) => Promise<RunResult>) {
    const mcp = {
        runNode: vi.fn().mockImplementation(
            runImpl ??
                (async () => {
                    store.log.push('mcp');
                    return { ok: true, output: null } satisfies RunResult;
                }),
        ),
    };
    return { engine: new OrchestrationEngine(store, mcp), mcp };
}

describe('OrchestrationEngine — store asynchrone (caractéristiques Postgres)', () => {
    it('attend chaque écriture : aucune écriture en vol quand runNode résout', async () => {
        const store = new DelayedAsyncStore(NODES);
        const { engine } = makeEngine(store);

        await engine.runNode('agent');

        expect(store.inFlightWrites).toBe(0);
        // L'écriture EXECUTING est committée AVANT l'appel MCP (ordre séquentiel).
        expect(store.log).toEqual([
            'write:start:EXECUTING',
            'write:commit:EXECUTING',
            'mcp',
            'write:start:WAITING_HUMAN_APPROVAL',
            'write:commit:WAITING_HUMAN_APPROVAL',
            'write:start:IDLE',
            'write:commit:IDLE',
        ]);
        expect(store.statusOf('agent')).toBe('IDLE');
    });

    it('un échec SQL sur une écriture est propagé (pas de succès silencieux)', async () => {
        const store = new DelayedAsyncStore(NODES);
        store.failOn = 'EXECUTING';
        const { engine, mcp } = makeEngine(store);

        await expect(engine.runNode('agent')).rejects.toThrow(/ÉCHEC SQL simulé/);
        // L'échec survient AVANT l'appel MCP : le nœud n'a pas été exécuté.
        expect(mcp.runNode).not.toHaveBeenCalled();
        expect(store.statusOf('agent')).toBe('IDLE');
    });

    it('un échec MCP fige le nœud en ERROR et attend l\'écriture ERROR', async () => {
        const store = new DelayedAsyncStore(NODES);
        const { engine } = makeEngine(store, async () => ({ ok: false, error: 'boom' }));

        const res = await engine.runNode('agent');

        expect(res).toEqual({ ok: false, error: 'boom' });
        expect(store.inFlightWrites).toBe(0);
        expect(store.statusOf('agent')).toBe('ERROR');
        // L'écriture ERROR a bien été committée (attendue) avant le retour.
        expect(store.log).toContain('write:commit:ERROR');
    });

    it('rejette NodeNotFoundError sur un nœud inconnu', async () => {
        const store = new DelayedAsyncStore(NODES);
        const { engine } = makeEngine(store);
        await expect(engine.runNode('inconnu')).rejects.toThrow(NodeNotFoundError);
    });

    it('empêche la double exécution concurrente (la 2ᵉ transition EXECUTING est refusée)', async () => {
        const store = new DelayedAsyncStore(NODES);
        const { engine } = makeEngine(store);

        const [first, second] = await Promise.allSettled([
            engine.runNode('agent'),
            engine.runNode('agent'),
        ]);

        // Exactement une exécution réussit ; l'autre est refusée par la machine
        // à états (IDLE→EXECUTING légal une seule fois tant que le nœud est occupé).
        const statuses = [first.status, second.status].sort();
        expect(statuses).toEqual(['fulfilled', 'rejected']);
        const rejected = first.status === 'rejected' ? first : (second as PromiseRejectedResult);
        expect(rejected.reason).toBeInstanceOf(IllegalTransitionError);
    });

    it('runFlow attend toutes les écritures de la chaîne avant de résoudre', async () => {
        const chain: HybridNode[] = [
            { ...NODES[0]!, id: 'a', parentID: null },
            {
                id: 'b',
                type: 'HUMAN',
                nom: 'Humain',
                roleTitre: 'Valide',
                parentID: 'a',
                gradeId: 'Direction',
                status: 'IDLE',
            },
        ];
        const store = new DelayedAsyncStore(chain);
        const { engine } = makeEngine(store);

        await engine.runFlow('a');

        expect(store.inFlightWrites).toBe(0);
        expect(store.statusOf('a')).toBe('IDLE');
        expect(store.statusOf('b')).toBe('WAITING_HUMAN_APPROVAL');
    });
});
