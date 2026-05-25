import type { HybridNode, NodeStatus } from '../types/hybridNode';

/**
 * Bus d'événements local — alimente l'`ActivityLog` (transitions, exécutions,
 * créations/éditions, notifications). Volontairement minimal : un EventTarget
 * partagé qu'on remplace par un vrai stream backend plus tard.
 */

export type ActivityKind = 'transition' | 'run' | 'create' | 'edit' | 'delete' | 'notify';

export interface ActivityEvent {
    id: string;
    kind: ActivityKind;
    nodeId: string;
    nodeName: string;
    message: string;
    from?: NodeStatus;
    to?: NodeStatus;
    timestamp: number;
}

const ACTIVITY_EVENT = 'organigrad:activity';

export function emitActivity(partial: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent {
    const evt: ActivityEvent = {
        id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        ...partial,
    };
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<ActivityEvent>(ACTIVITY_EVENT, { detail: evt }));
    }
    return evt;
}

export function onActivity(handler: (evt: ActivityEvent) => void): () => void {
    const fn = (e: Event) => handler((e as CustomEvent<ActivityEvent>).detail);
    window.addEventListener(ACTIVITY_EVENT, fn);
    return () => window.removeEventListener(ACTIVITY_EVENT, fn);
}

export function emitTransition(node: HybridNode, from: NodeStatus, to: NodeStatus): void {
    emitActivity({
        kind: 'transition',
        nodeId: node.id,
        nodeName: node.nom,
        message: `${from.replace(/_/g, ' ')} → ${to.replace(/_/g, ' ')}`,
        from,
        to,
    });
}
