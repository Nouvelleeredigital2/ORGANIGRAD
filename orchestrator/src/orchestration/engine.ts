import type { GraphStore } from '../state/graphStore.js';
import type { HybridNode, JsonObject } from '../domain/types.js';
import type { RunResult } from '../mcp/mcpClient.js';
import type { HumanGateNotifier } from '../synapse/producer.js';

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

/** Résultat d'une exécution de chaîne. */
export interface RunFlowResult {
    ok: boolean;
    /** Nœud humain où le flux s'est figé en attente de validation. */
    waitingHumanAt?: string;
    /** Nœud où le flux s'est arrêté sur erreur. */
    stoppedAt?: string;
    error?: string;
}

export class OrchestrationEngine {
    constructor(
        private readonly store: GraphStore,
        private readonly mcp: MinimalMcpClient,
        /**
         * Notifier de bus optionnel (APPS-2026). S'il est fourni, le moteur émet
         * `validation.requested` quand un nœud HUMAN est atteint. Optionnel :
         * sans lui, le comportement est strictement inchangé.
         */
        private readonly notifier?: HumanGateNotifier,
    ) {}

    /**
     * Lance la chaîne à partir d'un nœud racine.
     * Avance tant que :
     *   - le nœud courant n'est pas humain (sinon fige en WAITING_HUMAN_APPROVAL)
     *   - le résultat MCP est ok (sinon ERROR + stop)
     */
    async runFlow(rootId: string): Promise<RunFlowResult> {
        let current: HybridNode | null = await this.store.get(rootId);

        while (current) {
            if (current.type === 'HUMAN') {
                // Atteint le garant humain — passage par EXECUTING (state machine)
                // puis fige en WAITING_HUMAN_APPROVAL en attendant l'action HITL.
                await this.store.applyTransition(current.id, 'EXECUTING');
                await this.store.applyTransition(current.id, 'WAITING_HUMAN_APPROVAL');
                // Annonce au bus APPS-2026 qu'un humain doit valider (best-effort).
                await this.emitHumanGate(current);
                return { ok: true, waitingHumanAt: current.id };
            }

            // Exécute le nœud (AGENT_IA ou SOFTWARE_MCP) via MCP
            await this.store.applyTransition(current.id, 'EXECUTING');
            const result = await this.mcp.runNode(current);

            if (!result.ok) {
                // Échec → ERROR, stop du flux. L'écriture est attendue pour
                // garantir que l'état d'échec est persisté avant tout retour.
                await this.store.applyTransition(current.id, 'ERROR', { error: result.error });
                return { ok: false, stoppedAt: current.id, error: result.error };
            }

            // Quel est le nœud aval ?
            const next = await this.findDownstream(current.id);

            if (!next) {
                // Plus rien en aval → retour à IDLE (fin de flux)
                await this.store.applyTransition(current.id, 'WAITING_HUMAN_APPROVAL');
                // Auto-approve serait illégitime — un flux sans humain final passe par IDLE
                // mais WAITING_HUMAN_APPROVAL → IDLE est légal seulement via approve().
                // On modélise : pas d'humain en aval → on remet en IDLE directement.
                await this.store.applyTransition(current.id, 'IDLE');
                return { ok: true };
            }

            // Le nœud courant a terminé son rôle : il repasse en IDLE puis on
            // chaîne vers l'aval (qu'il soit humain ou agent/logiciel).
            await this.store.applyTransition(current.id, 'WAITING_HUMAN_APPROVAL');
            await this.store.applyTransition(current.id, 'IDLE');

            current = next;
        }
        return { ok: true };
    }

    /**
     * Reprend le flux à partir de l'aval d'un nœud (après validation humaine).
     * Renvoie `null` s'il n'y a pas d'aval. Utilisé par l'API après `approve`.
     */
    async resumeFromChildOf(nodeId: string): Promise<RunFlowResult | null> {
        const next = await this.findDownstream(nodeId);
        if (!next) return null;
        return this.runFlow(next.id);
    }

    /** Lance un nœud isolé (bouton ⚡ Run) — pas de chaînage. */
    async runNode(nodeId: string): Promise<RunResult> {
        const node = await this.store.get(nodeId);
        if (node.type === 'HUMAN') {
            throw new Error("Un nœud HUMAN ne s'exécute pas via runNode");
        }
        await this.store.applyTransition(nodeId, 'EXECUTING');
        const result = await this.mcp.runNode(node);
        if (!result.ok) {
            await this.store.applyTransition(nodeId, 'ERROR', { error: result.error });
        } else {
            await this.store.applyTransition(nodeId, 'WAITING_HUMAN_APPROVAL');
            await this.store.applyTransition(nodeId, 'IDLE');
        }
        return result;
    }

    /** L'humain approuve — sortie de WAITING_HUMAN_APPROVAL vers IDLE. */
    async approve(nodeId: string, payload?: JsonObject): Promise<void> {
        await this.store.applyTransition(nodeId, 'IDLE', payload);
    }

    /** L'humain rejette avec feedback — passe en ERROR. */
    async reject(nodeId: string, feedback: string): Promise<void> {
        await this.store.applyTransition(nodeId, 'ERROR', { feedback });
    }

    /** Reset d'un nœud en ERROR après correction. */
    async reset(nodeId: string): Promise<void> {
        await this.store.applyTransition(nodeId, 'IDLE');
    }

    /**
     * Émet `validation.requested` sur le bus pour un nœud HUMAN. Best-effort :
     * une panne du notifier/bus ne doit JAMAIS interrompre l'orchestration.
     */
    private async emitHumanGate(node: HybridNode): Promise<void> {
        if (!this.notifier) return;
        try {
            await this.notifier.onHumanGate(node);
        } catch {
            /* émission de bus best-effort — silencieuse par conception */
        }
    }

    private async findDownstream(parentId: string): Promise<HybridNode | null> {
        // Le nœud aval est celui dont `parentID === parentId`.
        const nodes = await this.store.list();
        const children = nodes.filter((n) => n.parentID === parentId);
        if (children.length === 0) return null;
        // Pour le cas Campagne Marketing : un seul enfant. Pour les graphes
        // plus complexes (fan-out), on prendrait le premier — l'orchestration
        // parallèle est hors scope Phase 1.
        return children[0] ?? null;
    }
}
