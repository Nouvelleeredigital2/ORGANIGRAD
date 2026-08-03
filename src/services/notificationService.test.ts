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

    /**
     * Risque couvert : le toast et le journal affirmaient « Canaux : email,
     * slackWebhook » quel que soit le résultat réel. Un webhook en 404 et un
     * envoi abouti produisaient exactement le même affichage, et l'e-mail —
     * qui ne part JAMAIS du navigateur — était compté comme notifié.
     */
    it('sépare les canaux réellement joints, échoués et délégués', async () => {
        // Harnais hermétique : `fetch` échoue par construction, donc Slack rate.
        const detail = await notifyHuman({ node: human, message: 'À valider' });

        expect(detail.channels).toEqual([]);
        expect(detail.failed.map((c) => c.key)).toEqual(['slackWebhook']);
        expect(detail.deferred.map((c) => c.key)).toEqual(['email']);
    });

    it('compte un canal comme joint uniquement si le driver a abouti', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
        const detail = await notifyHuman({
            node: { ...human, notificationChannels: { slackWebhook: 'https://hooks.slack.com/abc' } },
            message: 'À valider',
        });

        expect(detail.channels.map((c) => c.key)).toEqual(['slackWebhook']);
        expect(detail.failed).toEqual([]);
        vi.unstubAllGlobals();
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
