import type { Sql } from 'postgres';
import type { TransitionEvent } from '../state/graphStore.js';
import { safeFetch, type SsrfPolicy } from '../net/ssrfGuard.js';
import { parseEmailNotification, type EmailNotification } from './notificationContract.js';
import { FixedWindowRateLimiter, type RateLimiter } from './rateLimiter.js';

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
    /**
     * Workspace propriétaire de ce notifier. Requis pour l'e-mail (le contrat et
     * l'Edge Function exigent `workspaceId` ; auparavant il manquait toujours).
     */
    workspaceId?: string;
    /**
     * Politique SSRF appliquée aux webhooks Slack et à l'Edge Function. Permet
     * notamment de fournir une allowlist d'hôtes. Défaut : https + IP publiques
     * en production.
     */
    ssrfPolicy?: SsrfPolicy;
    /**
     * Limiteur de débit des envois sortants (anti-flood). Défaut : 60 envois /
     * 60 s par workspace. Injecter `unlimitedRateLimiter` pour désactiver.
     */
    rateLimiter?: RateLimiter;
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

/** Masque un webhook (le chemin contient le secret) pour les logs. */
export function maskWebhook(url: string): string {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}/***`;
    } catch {
        return '***';
    }
}

/** Masque une adresse e-mail pour les logs. */
export function maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return '***';
    return `${email[0]}***${email.slice(at)}`;
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

export interface PostWithRetryOptions {
    maxRetries?: number;
    /** En-têtes additionnels (ex. Authorization pour l'Edge Function). */
    headers?: Record<string, string>;
    /** Politique SSRF (allowlist, https-only en prod…). */
    ssrfPolicy?: SsrfPolicy;
}

export async function postWithRetry(
    fetchImpl: typeof fetch,
    url: string,
    body: unknown,
    opts: PostWithRetryOptions = {},
): Promise<Response> {
    const maxRetries = opts.maxRetries ?? 1;
    let lastError: unknown = new Error('pas de tentative');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // safeFetch : protection SSRF (les webhooks/URL sont configurables par
            // l'utilisateur), timeout, taille max et redirections contrôlées.
            const res = await safeFetch(
                url,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', ...opts.headers },
                    body: JSON.stringify(body),
                },
                opts.ssrfPolicy ?? {},
                { fetchImpl },
            );

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
    private readonly workspaceId?: string;
    private readonly ssrfPolicy: SsrfPolicy;
    private readonly rateLimiter: RateLimiter;
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
        this.workspaceId = opts.workspaceId;
        this.ssrfPolicy = opts.ssrfPolicy ?? {};
        this.rateLimiter =
            opts.rateLimiter ?? new FixedWindowRateLimiter({ max: 60, windowMs: 60_000 });
    }

    /** Autorise un envoi sortant (anti-flood), clé par workspace. */
    private allowOutbound(): boolean {
        const allowed = this.rateLimiter.tryConsume(this.workspaceId ?? 'global');
        if (!allowed) {
            console.warn('[notifier] limite de débit atteinte — envoi ignoré', {
                workspaceId: this.workspaceId,
            });
        }
        return allowed;
    }

    attach(): void {
        if (this.offTransition) return;
        this.offTransition = this.store.onTransition((evt) => {
            void this.emit(evt).catch((err) => {
                // Sortie seule : un échec webhook ne doit JAMAIS remonter au store.
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
                    workspaceId: this.workspaceId,
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
                    workspaceId: this.workspaceId,
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
        if (!this.allowOutbound()) return;

        // Contrat partagé : clé d'idempotence déterministe (stable entre retries
        // de la MÊME transition) + validation runtime avant tout appel réseau.
        const candidate: EmailNotification = {
            workspaceId: payload.workspaceId ?? '',
            nodeId: payload.nodeId,
            to: payload.to,
            type: payload.type,
            data: payload.data,
            idempotencyKey: `${payload.workspaceId ?? 'ws'}:${payload.nodeId}:${payload.type}:${String(
                payload.data.fromStatus ?? '',
            )}->${String(payload.data.toStatus ?? '')}`,
        };
        const parsed = parseEmailNotification(candidate);
        if (!parsed.ok) {
            console.warn('[notifier] payload email invalide, envoi ignoré', { reason: parsed.error });
            return;
        }

        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (this.supabaseServiceRoleKey) {
            headers['authorization'] = `Bearer ${this.supabaseServiceRoleKey}`;
        }

        try {
            // En-tête Authorization transmis + protection SSRF + vérification du
            // statut HTTP réel (un 4xx/5xx n'est PAS un succès).
            const res = await postWithRetry(this.fetchImpl, this.emailEdgeFunctionUrl, parsed.value, {
                headers,
                ssrfPolicy: this.ssrfPolicy,
            });
            if (!res.ok) {
                console.warn('[notifier] Edge Function notify-email a répondu en erreur', {
                    status: res.status,
                    to: maskEmail(payload.to),
                });
            }
        } catch (err) {
            console.warn('[notifier] échec envoi email', {
                to: maskEmail(payload.to),
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

        if (!this.allowOutbound()) return;

        try {
            const res = await postWithRetry(this.fetchImpl, url, payload, {
                ssrfPolicy: this.ssrfPolicy,
            });
            // Un statut HTTP non-2xx est un ÉCHEC réel, pas un succès silencieux.
            if (!res.ok) {
                auditStatus = 'failed';
                errorMsg = `HTTP ${res.status}`;
            } else {
                sentAt = isoNow();
            }
        } catch (err) {
            auditStatus = 'failed';
            errorMsg = err instanceof Error ? err.message : String(err);
            console.warn('[notifier] échec envoi Slack', { url: maskWebhook(url), error: errorMsg });
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
                    console.warn('[notifier] échec audit DB', e);
                });
        }
    }
}
