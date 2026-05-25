import { describe, it, expect, vi } from 'vitest';
import { emitActivity, onActivity, emitTransition } from './activityBus';
import type { HybridNode } from '../types/hybridNode';

const node: HybridNode = {
    id: 'n1',
    type: 'AGENT_IA',
    nom: 'IA',
    roleTitre: 'r',
    parentID: null,
    gradeId: 'E',
    status: 'IDLE',
};

describe('activityBus', () => {
    it('emitActivity diffuse un événement aux abonnés', () => {
        const handler = vi.fn();
        const off = onActivity(handler);
        emitActivity({ kind: 'run', nodeId: node.id, nodeName: node.nom, message: 'start' });
        off();
        expect(handler).toHaveBeenCalledOnce();
        const evt = handler.mock.calls[0][0];
        expect(evt.kind).toBe('run');
        expect(evt.message).toBe('start');
        expect(evt.id).toBeTruthy();
        expect(evt.timestamp).toBeTypeOf('number');
    });

    it('emitTransition encode from→to dans le message', () => {
        const handler = vi.fn();
        const off = onActivity(handler);
        emitTransition(node, 'IDLE', 'EXECUTING');
        off();
        const evt = handler.mock.calls[0][0];
        expect(evt.from).toBe('IDLE');
        expect(evt.to).toBe('EXECUTING');
        expect(evt.message).toMatch(/IDLE.*EXECUTING/);
    });
});
