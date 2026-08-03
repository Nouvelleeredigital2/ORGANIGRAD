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
    /** Canaux dont l'envoi a RÉELLEMENT abouti. */
    channels: Array<{ key: NotificationChannelKey; target: string }>;
    /** Canaux configurés dont l'envoi a échoué, avec la raison. */
    failed: Array<{ key: NotificationChannelKey; reason: string }>;
    /**
     * Canaux configurés qui ne partent pas depuis le navigateur : l'e-mail est
     * délégué à l'orchestrateur, WhatsApp n'a aucune API branchée. Les compter
     * comme « notifiés » laisserait croire que l'humain a été prévenu.
     */
    deferred: Array<{ key: NotificationChannelKey; reason: string }>;
    timestamp: number;
}

/** Canaux qui n'émettent rien depuis la SPA — cf. en-tête de fichier. */
const NON_EMETTEURS: Partial<Record<NotificationChannelKey, string>> = {
    email: "délégué à l'orchestrateur, rien n'est envoyé depuis le navigateur",
    whatsappId: 'aucune API configurée',
};

/**
 * Notifie l'humain sur tous ses canaux configurés.
 * Émet aussi un `CustomEvent` UI pour qu'un toast/centre de notif puisse réagir.
 */
export async function notifyHuman(payload: NotificationPayload): Promise<NotificationEventDetail> {
    const { node } = payload;
    const channels = node.notificationChannels ?? {};

    const used: NotificationEventDetail['channels'] = [];
    const failed: NotificationEventDetail['failed'] = [];
    const deferred: NotificationEventDetail['deferred'] = [];

    await Promise.all(
        (Object.keys(channels) as NotificationChannelKey[]).map(async (key) => {
            const target = channels[key];
            if (!target) return;

            const raison = NON_EMETTEURS[key];
            if (raison) {
                deferred.push({ key, reason: raison });
                return;
            }

            try {
                await drivers[key](target, payload);
                // Le canal n'est compté comme utilisé qu'APRÈS un envoi abouti :
                // l'inscrire avant faisait affirmer « Canaux : … » alors qu'un
                // webhook en 404 produisait exactement le même affichage.
                used.push({ key, target });
            } catch (err) {
                failed.push({ key, reason: err instanceof Error ? err.message : String(err) });
                console.warn(`[notify:${key}] échec`, err);
            }
        }),
    );

    const detail: NotificationEventDetail = {
        node,
        message: payload.message,
        channels: used,
        failed,
        deferred,
        timestamp: Date.now(),
    };

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<NotificationEventDetail>(NOTIFICATION_EVENT, { detail }));
    }

    return detail;
}
