/**
 * Service de notifications HITL.
 *
 * Drivers actifs :
 *  - slackWebhook  → POST JSON au webhook Slack (fetch natif)
 *  - email         → Supabase Edge Function `notify-email`
 *  - whatsappId    → no-op (canal déclaré, aucune API configurée)
 */
import type { HybridNode, NotificationChannels } from '../types/hybridNode';

export type NotificationChannelKey = keyof NotificationChannels;

export interface NotificationPayload {
    node: HybridNode;
    message: string;
    upstream?: HybridNode[];
}

export type NotificationDriver = (
    channelId: string,
    payload: NotificationPayload,
) => Promise<void> | void;

const drivers: Record<NotificationChannelKey, NotificationDriver> = {
    /** Slack Incoming Webhook — supporte CORS depuis le navigateur. */
    slackWebhook: async (url, { node, message }) => {
        if (!url) return;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: `[Organigrad] ${message}`,
                attachments: [
                    {
                        color: '#3B82F6',
                        fields: [
                            { title: 'Nœud', value: node.nom, short: true },
                            { title: 'Rôle', value: node.roleTitre, short: true },
                        ],
                    },
                ],
            }),
        });
        if (!resp.ok) throw new Error(`Slack webhook HTTP ${resp.status}`);
    },

    /**
     * Email — envoyé CÔTÉ SERVEUR par l'orchestrateur (Edge Function `notify-email`).
     *
     * Le SPA n'appelle plus directement la fonction : celle-ci exige désormais la
     * clé service_role (que le navigateur ne doit jamais détenir) et restreint le
     * destinataire au workflow (anti-relais, Priorité 5). L'e-mail part donc lors
     * de la transition d'état traitée par l'orchestrateur, pas depuis le client.
     */
    email: (_to, { node }) => {
        console.info(
            `[notify:email] e-mail délégué à l'orchestrateur (serveur) pour le nœud ${node.id}`,
        );
    },

    /** WhatsApp Business — canal déclaré dans le schéma, aucune API configurée. */
    whatsappId: (_to, { node, message }) => {
        console.warn(
            `[notify:whatsapp] Driver non implémenté — message ignoré : "${message}" (nœud ${node.id})`,
        );
    },
};

export const NOTIFICATION_EVENT = 'organigrad:notification';

export interface NotificationEventDetail {
    node: HybridNode;
    message: string;
    channels: Array<{ key: NotificationChannelKey; target: string }>;
    timestamp: number;
}

/**
 * Notifie l'humain sur tous ses canaux configurés.
 * Émet aussi un `CustomEvent` UI pour qu'un toast/centre de notif puisse réagir.
 */
export async function notifyHuman(payload: NotificationPayload): Promise<NotificationEventDetail> {
    const { node } = payload;
    const channels = node.notificationChannels ?? {};

    const used: NotificationEventDetail['channels'] = [];

    await Promise.all(
        (Object.keys(channels) as NotificationChannelKey[]).map(async (key) => {
            const target = channels[key];
            if (!target) return;
            used.push({ key, target });
            try {
                await drivers[key](target, payload);
            } catch (err) {
                console.warn(`[notify:${key}] échec`, err);
            }
        }),
    );

    const detail: NotificationEventDetail = {
        node,
        message: payload.message,
        channels: used,
        timestamp: Date.now(),
    };

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<NotificationEventDetail>(NOTIFICATION_EVENT, { detail }));
    }

    return detail;
}
