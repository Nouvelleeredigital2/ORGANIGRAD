import { describe, it, expect } from 'vitest';
import { parseEmailNotification, isValidEmail } from '../src/observability/notificationContract.js';

const valid = {
    workspaceId: 'ws-1',
    nodeId: 'n-1',
    to: 'a@b.fr',
    type: 'hitl',
    data: { nodeName: 'X' },
    idempotencyKey: 'ws-1:n-1:hitl:EXECUTING->WAITING_HUMAN_APPROVAL',
};

describe('parseEmailNotification (contrat partagé)', () => {
    it('accepte un payload valide', () => {
        const r = parseEmailNotification(valid);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.to).toBe('a@b.fr');
    });

    it('refuse workspaceId manquant', () => {
        const r = parseEmailNotification({ ...valid, workspaceId: '' });
        expect(r).toEqual({ ok: false, error: 'workspaceId requis' });
    });

    it('refuse une adresse e-mail invalide', () => {
        const r = parseEmailNotification({ ...valid, to: 'pas-un-email' });
        expect(r.ok).toBe(false);
    });

    it('refuse un type inconnu', () => {
        const r = parseEmailNotification({ ...valid, type: 'sms' });
        expect(r.ok).toBe(false);
    });

    it('refuse idempotencyKey manquant', () => {
        const r = parseEmailNotification({ ...valid, idempotencyKey: '' });
        expect(r.ok).toBe(false);
    });

    it('refuse data non-objet', () => {
        const r = parseEmailNotification({ ...valid, data: 'x' });
        expect(r.ok).toBe(false);
    });

    it('isValidEmail', () => {
        expect(isValidEmail('a@b.co')).toBe(true);
        expect(isValidEmail('nope')).toBe(false);
    });
});
