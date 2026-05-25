import type { Sql } from 'postgres';
import type { TransitionEvent } from '../state/graphStore.js';

/**
 * Interface minimale requise par le Notifier — compatible GraphStore et PgGraphStore.
 * Le Notifier utilise uniquement evt.nodeSnapshot (toujours défini), il n'appelle
 * jamais store.get() directement.
 */
export interface ObservableStore {
    onTransition(listener: (evt: TransitionEvent) => void): () => void;
}

/**
 * Couche observabilité — SORTIE SEULE vers la messagerie (Slack).
 *
 * Architecture imposée :
 *   - `#validations` : ping HITL quand un nœud passe en WAITING_HUMAN_APPROVAL.
 *   - `#flux-agents` : journal vivant, posté à chaque autre transition.
 *
 * RÈGLE D'OR : aucun listener entrant. La messagerie ne pilote JAMAIS l'état.
 * Si tu te surprends à écrire `onMessage` ici, c'est hors archi.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationAuditEntry {
    node_id: string | null;
    channel: 'slack_webhook' | 'email' | 'whatsapp';
    target: string;
    message: string;
    status: 'sent' | 'failed';
    error: string | null;
    sent_at: string | null;
}

/**
 * Interface d'audit injectable — permet de mocker en test sans dépendance postgres.
 * L'implémentation (PgAuditLogger) est responsable d'attacher workspace_id.
 */
export interface AuditLogger {
    insert(entry: NotificationAuditEntry): Promise<void>;
}

/**
 * Implémentation production : INSERT dans `public.notifications` via postgres.js.
 * Le workspaceId est fixé à la construction (une instance = un workspace).
 */
export class PgAuditLogger implements AuditLogger {
    constructor(
        private readonly sql: Sql,
        private readonly workspaceId: string,
    ) {}

    async insert(entry: NotificationAuditEntry): Promise<void> {
        await this.sql`
            insert into public.notifications
                (workspace_id, node_id, channel, target, message, status, error, sent_at)
            values (
                ${this.workspaceId},
                ${entry.node_id ?? null},
                ${entry.channel},
                ${entry.target},
                ${entry.message},
                ${entry.status},
                ${entry.error ?? null},
                ${entry.sent_at ?? null}
            )
        `;
    }
}

export interface NotifierOptions {
    store: ObservableStore;
    fetchImpl?: typeof fetch;
    validationsWebhook?: string;
    fluxWebhook?: string;
    /** URL publique de l'app (pour les deep-links dans les blocs Slack et emails). */
    appUrl?: string;
    /** Logger d'audit DB (optionnel — absent en mode in-memory / tests unitaires). */
    auditLogger?: AuditLogger;
    /**
     * URL de la Supabase Edge Function `notify-email`.
     * Si absent, les notifications email sont ignorées.
     * Ex. https://<ref>.supabase.co/functions/v1/notify-email
     */
    emailEdgeFunctionUrl?: string;
    /**
     * Clé service_role Supabase — requise pour appeler l'Edge Function
     * en mode service (bypass RLS). Ne jamais exposer côté client.
     */
    supabaseServiceRoleKey?: string;
}

// ─── Slack Block Kit builders ─────────────────────────────────────────────────

const STATUS_EMOJI: Record<string, string> = {
    IDLE: '⬜',
    EXECUTING: '🔄',
    CONTROL_PENDING_IA: '🤖',
    WAITING_HUMAN_APPROVAL: '⏳',
    ERROR: '❌',
};

function isoNow(): string {
    return new Date().toISOString();
}

export function buildValidationBlocks(
    nodeId: string,
    nodeName: string,
    roleTitre: string,
    from: string,
    to: string,
    appUrl?: string,
): unknown[] {
    const blocks: unknown[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: '🔒 Validation requise — Organigrad',
                emoji: true,
            },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Nœud*\n${nodeName}` },
                { type: 'mrkdwn', text: `*Rôle*\n${roleTitre}` },
                { type: 'mrkdwn', text: `*Transition*\n\`${from}\` → \`${to}\`` },
                { type: 'mrkdwn', text: `*ID nœud*\n\`${nodeId}\`` },
            ],
        },
    ];

    if (appUrl) {
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '📋 Ouvrir le Centre de validation',
                        emoji: true,
                    },
                    url: `${appUrl}?view=orchestration&nodeId=${encodeURIComponent(nodeId)}`,
                    style: 'primary',
                },
            ],
        });
    }

    blocks.push({
        type: 'context',
        elements: [
            { type: 'mrkdwn', text: `Organigrad · *#validations* · ${isoNow()}` },
        ],
    });

    return blocks;
}

export function buildFluxBlocks(
    nodeId: string,
    nodeName: string,
    roleTitre: string,
    from: string,
    to: string,
    error?: string,
): unknown[] {
    const emoji = STATUS_EMOJI[to] ?? '•';
    let bodyText = `${emoji} *${nodeName}* (${roleTitre}) · \`${from}\` → \`${to}\``;
    if (error) bodyText += `\n> ⚠️ ${error}`;

    return [
        {
            type: 'section',
            text: { type: 'mrkdwn', text: bodyText },
        },
        {
            type: 'context',
            elements: [
                { type: 'mrkdwn', text: `Organigrad · \`${nodeId}\` · ${isoNow()}` },
            ],
        },
    ];
}

// ─── HTTP helper avec 1 retry sur 5xx ─────────────────────────────────────────

export async function postWithRetry(
    fetchImpl: typeof fetch,
    url: string,
    body: unknown,
    maxRetries = 1,
): Promise<Response> {
    let lastError: unknown = new Error('pas de tentative');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetchImpl(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });

            // Retry uniquement sur les erreurs serveur 5xx (sauf dernier essai)
            if (res.status >= 500 && attempt < maxRetries) {
                lastError = new Error(`HTTP ${res.status}`);
                continue;
            }

            return res;
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) continue;
        }
    }

    throw lastError;
}

// ─── Classe principale ────────────────────────────────────────────────────────

export class Notifier {
    private readonly store: ObservableStore;
    private readonly fetchImpl: typeof fetch;
    private readonly validationsWebhook?: string;
    private readonly fluxWebhook?: string;
    private readonly appUrl?: string;
    private readonly auditLogger?: AuditLogger;
    private readonly emailEdgeFunctionUrl?: string;
    private readonly supabaseServiceRoleKey?: string;
    private offTransition: (() => void) | null = null;

    constructor(opts: NotifierOptions) {
        this.store = opts.store;
        this.fetchImpl = opts.fetchImpl ?? fetch;
        this.validationsWebhook = opts.validationsWebhook;
        this.fluxWebhook = opts.fluxWebhook;
        this.appUrl = opts.appUrl;
        this.auditLogger = opts.auditLogger;
        this.emailEdgeFunctionUrl = opts.emailEdgeFunctionUrl;
        this.supabaseServiceRoleKey = opts.supabaseServiceRoleKey;
    }

    attach(): void {
        if (this.offTransition) return;
        this.offTransition = this.store.onTransition((evt) => {
            void this.emit(evt).catch((err) => {
                // Sortie seule : un échec webhook ne doit JAMAIS remonter au store.
                // eslint-disable-next-line no-console
                console.warn('[notifier] échec émission', err);
            });
        });
    }

    detach(): void {
        if (this.offTransition) {
            this.offTransition();
            this.offTransition = null;
        }
    }

    private async emit(evt: TransitionEvent): Promise<void> {
        if (evt.to === 'WAITING_HUMAN_APPROVAL') {
            await this.notifyValidation(evt);
        } else {
            await this.notifyFluxJournal(evt);
        }
    }

    private async notifyValidation(evt: TransitionEvent): Promise<void> {
        // evt.nodeSnapshot est toujours défini depuis graphStore + pgGraphStore
        const node = evt.nodeSnapshot;
        const blocks = buildValidationBlocks(
            evt.nodeId,
            node.nom,
            node.roleTitre,
            evt.from,
            evt.to,
            this.appUrl,
        );
        const fallbackText = `🔒 Validation requise · ${node.nom} (${node.roleTitre}) — ${evt.from} → ${evt.to}`;
        const slackPayload = { text: fallbackText, blocks };

        const tasks: Promise<void>[] = [];

        // ── Slack ──
        const slackTargets: string[] = [];
        if (this.validationsWebhook) slackTargets.push(this.validationsWebhook);
        if (node.notificationChannels?.slackWebhook) {
            slackTargets.push(node.notificationChannels.slackWebhook);
        }
        tasks.push(
            ...slackTargets.map((url) =>
                this.sendAndAudit(url, slackPayload, evt.nodeId, fallbackText),
            ),
        );

        // ── Email ──
        if (node.notificationChannels?.email && this.emailEdgeFunctionUrl) {
            tasks.push(
                this.sendEmail({
                    workspaceId: evt.payload?.workspaceId as string | undefined,
                    nodeId: evt.nodeId,
                    to: node.notificationChannels.email,
                    type: 'hitl',
                    data: {
                        nodeName: node.nom,
                        roleTitle: node.roleTitre,
                        nodeId: evt.nodeId,
                        fromStatus: evt.from,
                        toStatus: evt.to,
                        appUrl: this.appUrl,
                        generatedAt: isoNow(),
                    },
                }),
            );
        }

        await Promise.all(tasks);
    }

    private async notifyFluxJournal(evt: TransitionEvent): Promise<void> {
        const node = evt.nodeSnapshot;
        const errorStr =
            evt.payload && 'error' in evt.payload ? String(evt.payload.error) : undefined;

        const tasks: Promise<void>[] = [];

        // ── Slack ──
        if (this.fluxWebhook) {
            const blocks = buildFluxBlocks(
                evt.nodeId,
                node.nom,
                node.roleTitre,
                evt.from,
                evt.to,
                errorStr,
            );
            const fallbackText = `${node.nom} → ${evt.to}${errorStr ? ` : ${errorStr}` : ''}`;
            tasks.push(
                this.sendAndAudit(
                    this.fluxWebhook,
                    { text: fallbackText, blocks },
                    evt.nodeId,
                    fallbackText,
                ),
            );
        }

        // ── Email flux (uniquement pour ERROR — évite le flood pour chaque statut) ──
        if (
            evt.to === 'ERROR' &&
            node.notificationChannels?.email &&
            this.emailEdgeFunctionUrl
        ) {
            tasks.push(
                this.sendEmail({
                    workspaceId: evt.payload?.workspaceId as string | undefined,
                    nodeId: evt.nodeId,
                    to: node.notificationChannels.email,
                    type: 'flux',
                    data: {
                        nodeName: node.nom,
                        roleTitle: node.roleTitre,
                        nodeId: evt.nodeId,
                        fromStatus: evt.from,
                        toStatus: evt.to,
                        error: errorStr,
                        generatedAt: isoNow(),
                    },
                }),
            );
        }

        if (tasks.length > 0) await Promise.all(tasks);
    }

    /**
     * Appelle l'Edge Function `notify-email` avec le payload structuré.
     * La fonction gère le rendu HTML, l'envoi Resend et l'audit en base.
     * Les erreurs sont absorbées — sortie seule.
     */
    private async sendEmail(payload: {
        workspaceId?: string;
        nodeId: string;
        to: string;
        type: 'hitl' | 'flux';
        data: Record<string, unknown>;
    }): Promise<void> {
        if (!this.emailEdgeFunctionUrl) return;

        const headers: Record<string, string> = {
            'content-type': 'application/json',
        };
        if (this.supabaseServiceRoleKey) {
            headers['authorization'] = `Bearer ${this.supabaseServiceRoleKey}`;
        }

        try {
            await postWithRetry(
                this.fetchImpl,
                this.emailEdgeFunctionUrl,
                payload,
            );
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[notifier] échec envoi email', {
                to: payload.to,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /**
     * Envoie le payload Slack (avec retry 5xx) et journalise le résultat
     * dans `notifications` si un `auditLogger` est configuré.
     */
    private async sendAndAudit(
        url: string,
        payload: unknown,
        nodeId: string,
        humanReadableMsg: string,
    ): Promise<void> {
        let auditStatus: 'sent' | 'failed' = 'sent';
        let errorMsg: string | null = null;
        let sentAt: string | null = null;

        try {
            await postWithRetry(this.fetchImpl, url, payload);
            sentAt = isoNow();
        } catch (err) {
            auditStatus = 'failed';
            errorMsg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.warn('[notifier] échec envoi Slack', { url, error: errorMsg });
        }

        if (this.auditLogger) {
            await this.auditLogger
                .insert({
                    node_id: nodeId,
                    channel: 'slack_webhook',
                    target: url,
                    message: humanReadableMsg,
                    status: auditStatus,
                    error: errorMsg,
                    sent_at: sentAt,
                })
                .catch((e) => {
                    // Ne jamais propager une erreur DB dans le flux d'état
                    // eslint-disable-next-line no-console
                    console.warn('[notifier] échec audit DB', e);
                });
        }
    }
}
