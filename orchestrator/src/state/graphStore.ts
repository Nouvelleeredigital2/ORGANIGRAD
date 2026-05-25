import { transition, type NodeStatus } from '../domain/stateMachine.js';
import type { HybridNode } from '../domain/types.js';

/**
 * Store d'état — source de vérité unique des `HybridNode` et de leur `NodeStatus`.
 *
 * Toute mutation passe IMPÉRATIVEMENT par `applyTransition()` qui délègue à la
 * machine à états. C'est le seul code de l'orchestrateur autorisé à écrire un
 * statut. Le moteur, l'API et l'observabilité observent et n'écrivent jamais.
 */

export class NodeNotFoundError extends Error {
    constructor(public readonly nodeId: string) {
        super(`Nœud introuvable : ${nodeId}`);
        this.name = 'NodeNotFoundError';
    }
}

export interface TransitionEvent {
    nodeId: string;
    from: NodeStatus;
    to: NodeStatus;
    timestamp: number;
    /** Payload optionnel transporté avec la transition (livrable, feedback…). */
    payload?: Record<string, unknown>;
    /**
     * Snapshot du nœud après transition (statut mis à jour).
     * Toujours défini — évite aux listeners (ex. Notifier) d'appeler store.get()
     * et supprime les problèmes async/sync entre GraphStore et PgGraphStore.
     */
    nodeSnapshot: import('../domain/types.js').HybridNode;
}

type TransitionListener = (evt: TransitionEvent) => void;

export class GraphStore {
    private nodes = new Map<string, HybridNode>();
    private listeners = new Set<TransitionListener>();

    load(nodes: HybridNode[]): void {
        this.nodes.clear();
        for (const n of nodes) {
            // Clone défensif — pas de référence externe partagée
            this.nodes.set(n.id, { ...n });
        }
    }

    list(): readonly HybridNode[] {
        return [...this.nodes.values()].map((n) => ({ ...n }));
    }

    snapshot(): HybridNode[] {
        return [...this.nodes.values()].map((n) => ({ ...n }));
    }

    get(id: string): HybridNode {
        const n = this.nodes.get(id);
        if (!n) throw new NodeNotFoundError(id);
        return { ...n };
    }

    has(id: string): boolean {
        return this.nodes.has(id);
    }

    /**
     * Applique une transition légale et met à jour le statut.
     * Lance `IllegalTransitionError` sans muter si la transition est refusée.
     */
    applyTransition(
        nodeId: string,
        to: NodeStatus,
        payload?: Record<string, unknown>,
    ): HybridNode {
        const node = this.nodes.get(nodeId);
        if (!node) throw new NodeNotFoundError(nodeId);
        const from = node.status;

        // Délègue à la machine à états — lèvera IllegalTransitionError si refusé
        const nextStatus = transition(from, to);

        const updated: HybridNode = { ...node, status: nextStatus };
        this.nodes.set(nodeId, updated);

        const evt: TransitionEvent = {
            nodeId,
            from,
            to: nextStatus,
            timestamp: Date.now(),
            payload,
            nodeSnapshot: { ...updated },
        };
        for (const fn of this.listeners) fn(evt);

        return { ...updated };
    }

    onTransition(listener: TransitionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
