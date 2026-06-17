import { transition, type NodeStatus } from '../domain/stateMachine.js';
import type { HybridNode, JsonObject } from '../domain/types.js';

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
    payload?: JsonObject;
    /**
     * Snapshot du nœud après transition (statut mis à jour).
     * Toujours défini — évite aux listeners (ex. Notifier) d'appeler store.get()
     * et supprime les problèmes async/sync entre GraphStore et PgGraphStore.
     */
    nodeSnapshot: import('../domain/types.js').HybridNode;
}

type TransitionListener = (evt: TransitionEvent) => void;

/**
 * Contrat de store — EXPLICITEMENT asynchrone.
 *
 * C'est la seule abstraction sur laquelle s'appuie l'`OrchestrationEngine`. Les
 * deux implémentations (`InMemoryGraphStore`, `PgGraphStore`) le satisfont, ce
 * qui supprime tout cast (`as never`) et garantit que le moteur attend
 * réellement chaque lecture/écriture — y compris les écritures SQL — avant de
 * poursuivre ou de répondre.
 */
export interface GraphStore {
    get(id: string): Promise<HybridNode>;
    list(): Promise<readonly HybridNode[]>;
    applyTransition(
        nodeId: string,
        to: NodeStatus,
        payload?: JsonObject,
    ): Promise<HybridNode>;
    onTransition(listener: TransitionListener): () => void;
}

/**
 * Implémentation in-memory du contrat `GraphStore` (tests, dev local sans DB).
 *
 * Les méthodes sont asynchrones pour respecter le contrat, mais la mutation et
 * l'émission des événements restent synchrones (aucun `await` avant la boucle
 * de listeners) : les observateurs (ex. Notifier) sont donc notifiés dans le
 * même tick, comme avec un store réel.
 */
export class InMemoryGraphStore implements GraphStore {
    private nodes = new Map<string, HybridNode>();
    private listeners = new Set<TransitionListener>();

    load(nodes: HybridNode[]): void {
        this.nodes.clear();
        for (const n of nodes) {
            // Clone défensif — pas de référence externe partagée
            this.nodes.set(n.id, { ...n });
        }
    }

    async list(): Promise<readonly HybridNode[]> {
        return [...this.nodes.values()].map((n) => ({ ...n }));
    }

    /** Vue synchrone immuable — pratique interne au store in-memory. */
    snapshot(): HybridNode[] {
        return [...this.nodes.values()].map((n) => ({ ...n }));
    }

    async get(id: string): Promise<HybridNode> {
        const n = this.nodes.get(id);
        if (!n) throw new NodeNotFoundError(id);
        return { ...n };
    }

    async has(id: string): Promise<boolean> {
        return this.nodes.has(id);
    }

    /**
     * Applique une transition légale et met à jour le statut.
     * Lance `IllegalTransitionError` sans muter si la transition est refusée.
     */
    async applyTransition(
        nodeId: string,
        to: NodeStatus,
        payload?: JsonObject,
    ): Promise<HybridNode> {
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
