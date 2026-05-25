import { describe, it, expect } from 'vitest';
import {
    canTransition,
    transition,
    IllegalTransitionError,
    type NodeStatus,
} from '../src/domain/stateMachine.js';

describe('stateMachine — transitions légales', () => {
    const LEGAL: Array<[NodeStatus, NodeStatus]> = [
        ['IDLE', 'EXECUTING'],
        ['EXECUTING', 'CONTROL_PENDING_IA'],
        ['EXECUTING', 'WAITING_HUMAN_APPROVAL'],
        ['EXECUTING', 'ERROR'],
        ['CONTROL_PENDING_IA', 'WAITING_HUMAN_APPROVAL'],
        ['CONTROL_PENDING_IA', 'ERROR'],
        ['WAITING_HUMAN_APPROVAL', 'IDLE'],
        ['WAITING_HUMAN_APPROVAL', 'ERROR'],
        ['ERROR', 'IDLE'],
    ];

    it.each(LEGAL)('canTransition(%s, %s) === true', (from, to) => {
        expect(canTransition(from, to)).toBe(true);
    });

    it.each(LEGAL)('transition(%s, %s) renvoie le nouveau statut', (from, to) => {
        expect(transition(from, to)).toBe(to);
    });
});

describe('stateMachine — transitions illégales', () => {
    const ILLEGAL: Array<[NodeStatus, NodeStatus]> = [
        ['IDLE', 'ERROR'],
        ['IDLE', 'WAITING_HUMAN_APPROVAL'],
        ['IDLE', 'CONTROL_PENDING_IA'],
        ['EXECUTING', 'IDLE'],
        ['WAITING_HUMAN_APPROVAL', 'EXECUTING'],
    ];

    it.each(ILLEGAL)('canTransition(%s, %s) === false', (from, to) => {
        expect(canTransition(from, to)).toBe(false);
    });

    it.each(ILLEGAL)('transition(%s, %s) lève IllegalTransitionError', (from, to) => {
        expect(() => transition(from, to)).toThrowError(IllegalTransitionError);
    });

    it('l\'erreur expose les statuts impliqués', () => {
        try {
            transition('IDLE', 'ERROR');
            expect.fail('aurait dû lever');
        } catch (err) {
            expect(err).toBeInstanceOf(IllegalTransitionError);
            const e = err as IllegalTransitionError;
            expect(e.from).toBe('IDLE');
            expect(e.to).toBe('ERROR');
        }
    });
});

describe('stateMachine — transitions stationnaires (no-op)', () => {
    it('canTransition(IDLE, IDLE) === false (pas de self-loop autorisé)', () => {
        expect(canTransition('IDLE', 'IDLE')).toBe(false);
    });
});
