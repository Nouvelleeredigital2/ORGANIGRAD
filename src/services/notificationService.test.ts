import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyHuman, NOTIFICATION_EVENT } from './notificationService';
import type { HybridNode } from '../types/hybridNode';

const human: HybridNode = {
    id: 'h1',
    type: 'HUMAN',
    nom: 'Camille',
    roleTitre: 'DirMarketing',
    parentID: null,
    gradeId: 'D',
    notificationChannels: {
        slackWebhook: 'https://hooks.slack.com/abc',
        email: 'c@x.fr',
    },
    status: 'WAITING_HUMAN_APPROVAL',
};

describe('notificationService', () => {
    beforeEach(() => {
        vi.spyOn(console, 'info').mockImplementation(() => {});
    });

    it('appelle tous les drivers configurés', async () => {
        const detail = await notifyHuman({ node: human, message: 'À valider' });
        const keys = detail.channels.map((c) => c.key).sort();
        expect(keys).toEqual(['email', 'slackWebhook']);
    });

    it('émet un CustomEvent UI', async () => {
        const handler = vi.fn();
        window.addEventListener(NOTIFICATION_EVENT, handler);
        await notifyHuman({ node: human, message: 'Ping' });
        window.removeEventListener(NOTIFICATION_EVENT, handler);
        expect(handler).toHaveBeenCalledOnce();
    });

    it("n'envoie rien sans canaux configurés", async () => {
        const detail = await notifyHuman({ node: { ...human, notificationChannels: undefined }, message: 'X' });
        expect(detail.channels).toEqual([]);
    });
});
