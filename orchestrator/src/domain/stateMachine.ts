/**
 * Machine à états pure — la SEULE porte autorisée pour muter un `NodeStatus`.
 * Aucun chemin alternatif n'est admis dans le moteur, le store, ni l'API.
 *
 * Tableau A du BRIEF — transitions légales :
 *
 *   IDLE                    → EXECUTING
 *   EXECUTING               → CONTROL_PENDING_IA
 *   EXECUTING               → WAITING_HUMAN_APPROVAL
 *   EXECUTING               → ERROR
 *   CONTROL_PENDING_IA      → WAITING_HUMAN_APPROVAL
 *   CONTROL_PENDING_IA      → ERROR
 *   WAITING_HUMAN_APPROVAL  → IDLE    (humain approuve)
 *   WAITING_HUMAN_APPROVAL  → ERROR   (humain rejette avec feedback)
 *   ERROR                   → IDLE    (reset manuel après correction)
 *
 * Toute autre transition est illégale. Aucune auto-boucle (`X → X`).
 */

export type NodeStatus =
    | 'IDLE'
    | 'EXECUTING'
    | 'CONTROL_PENDING_IA'
    | 'WAITING_HUMAN_APPROVAL'
    | 'ERROR';

const ALLOWED: Record<NodeStatus, ReadonlySet<NodeStatus>> = {
    IDLE: new Set<NodeStatus>(['EXECUTING']),
    EXECUTING: new Set<NodeStatus>(['CONTROL_PENDING_IA', 'WAITING_HUMAN_APPROVAL', 'ERROR']),
    CONTROL_PENDING_IA: new Set<NodeStatus>(['WAITING_HUMAN_APPROVAL', 'ERROR']),
    WAITING_HUMAN_APPROVAL: new Set<NodeStatus>(['IDLE', 'ERROR']),
    ERROR: new Set<NodeStatus>(['IDLE']),
};

export class IllegalTransitionError extends Error {
    constructor(
        public readonly from: NodeStatus,
        public readonly to: NodeStatus,
    ) {
        super(`Transition illégale : ${from} → ${to}`);
        this.name = 'IllegalTransitionError';
    }
}

export function canTransition(from: NodeStatus, to: NodeStatus): boolean {
    return ALLOWED[from].has(to);
}

export function transition(from: NodeStatus, to: NodeStatus): NodeStatus {
    if (!canTransition(from, to)) {
        throw new IllegalTransitionError(from, to);
    }
    return to;
}

export function legalTargetsFrom(from: NodeStatus): readonly NodeStatus[] {
    return [...ALLOWED[from]];
}
