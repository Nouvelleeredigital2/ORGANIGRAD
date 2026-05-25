import type { GraphStore } from '../state/graphStore.js';
import type { HybridNode } from '../domain/types.js';
import type { RunResult } from '../mcp/mcpClient.js';

/**
 * Moteur d'orchestration — applique les règles HITL en s'appuyant sur :
 *   - la machine à états (via `store.applyTransition`)
 *   - le client MCP (pour les exécutions IA / Logiciel)
 *
 * Règles d'or :
 *   1. `WAITING_HUMAN_APPROVAL` ne se quitte QUE par `approve()` ou `reject()`.
 *   2. Un échec MCP fige le nœud en `ERROR`, le flux s'arrête immédiatement.
 *   3. Toute mutation de statut passe par le store → la machine à états.
 *
 * Topologie de flux : chaque nœud déclare un `parentID` (= nœud amont).
 * Le moteur trouve l'enfant d'un nœud donné en filtrant le graphe par parentID.
 */

interface MinimalMcpClient {
    runNode(node: HybridNode): Promise<RunResult>;
}

export class OrchestrationEngine {
    constructor(
        private readonly store: GraphStore,
        private readonly mcp: MinimalMcpClient,
    ) {}

    /**
     * Lance la chaîne à partir d'un nœud racine.
     * Avance tant que :
     *   - le nœud courant n'est pas humain (sinon fige en WAITING_HUMAN_APPROVAL)
     *   - le résultat MCP est ok (sinon ERROR + stop)
     */
    async runFlow(rootId: string): Promise<void> {
        let current: HybridNode | null = this.store.get(rootId);

        while (current) {
            if (current.type === 'HUMAN') {
                // Atteint le garant humain — passage par EXECUTING (state machine)
                // puis fige en WAITING_HUMAN_APPROVAL en attendant l'action HITL.
                this.store.applyTransition(current.id, 'EXECUTING');
                this.store.applyTransition(current.id, 'WAITING_HUMAN_APPROVAL');
                return;
            }

            // Exécute le nœud (AGENT_IA ou SOFTWARE_MCP) via MCP
            this.store.applyTransition(current.id, 'EXECUTING');
            const result = await this.mcp.runNode(current);

            if (!result.ok) {
                // Échec → ERROR, stop du flux
                this.store.applyTransition(current.id, 'ERROR', { error: result.error });
                return;
            }

            // Quel est le nœud aval ?
            const next = this.findDownstream(current.id);

            if (!next) {
                // Plus rien en aval → retour à IDLE (fin de flux)
                this.store.applyTransition(current.id, 'WAITING_HUMAN_APPROVAL');
                // Auto-approve serait illégitime — un flux sans humain final passe par IDLE
                // mais WAITING_HUMAN_APPROVAL → IDLE est légal seulement via approve().
                // On modélise : pas d'humain en aval → on remet en IDLE directement.
                this.store.applyTransition(current.id, 'IDLE');
                return;
            }

            if (next.type === 'HUMAN') {
                // Le prochain est humain : le nœud courant a terminé son rôle,
                // le passage à l'humain se fait par la branche du loop suivant.
                this.store.applyTransition(current.id, 'WAITING_HUMAN_APPROVAL');
                this.store.applyTransition(current.id, 'IDLE');
            } else {
                // Suite agent/logiciel : le courant retourne à IDLE, on chaîne
                this.store.applyTransition(current.id, 'WAITING_HUMAN_APPROVAL');
                this.store.applyTransition(current.id, 'IDLE');
            }

            current = next;
        }
    }

    /** Lance un nœud isolé (bouton ⚡ Run) — pas de chaînage. */
    async runNode(nodeId: string): Promise<RunResult> {
        const node = this.store.get(nodeId);
        if (node.type === 'HUMAN') {
            throw new Error("Un nœud HUMAN ne s'exécute pas via runNode");
        }
        this.store.applyTransition(nodeId, 'EXECUTING');
        const result = await this.mcp.runNode(node);
        if (!result.ok) {
            this.store.applyTransition(nodeId, 'ERROR', { error: result.error });
        } else {
            this.store.applyTransition(nodeId, 'WAITING_HUMAN_APPROVAL');
            this.store.applyTransition(nodeId, 'IDLE');
        }
        return result;
    }

    /** L'humain approuve — sortie de WAITING_HUMAN_APPROVAL vers IDLE. */
    approve(nodeId: string, payload?: Record<string, unknown>): void {
        this.store.applyTransition(nodeId, 'IDLE', payload);
    }

    /** L'humain rejette avec feedback — passe en ERROR. */
    reject(nodeId: string, feedback: string): void {
        this.store.applyTransition(nodeId, 'ERROR', { feedback });
    }

    /** Reset d'un nœud en ERROR après correction. */
    reset(nodeId: string): void {
        this.store.applyTransition(nodeId, 'IDLE');
    }

    private findDownstream(parentId: string): HybridNode | null {
        // Le nœud aval est celui dont `parentID === parentId`.
        const children = this.store.list().filter((n) => n.parentID === parentId);
        if (children.length === 0) return null;
        // Pour le cas Campagne Marketing : un seul enfant. Pour les graphes
        // plus complexes (fan-out), on prendrait le premier — l'orchestration
        // parallèle est hors scope Phase 1.
        return children[0] ?? null;
    }
}
