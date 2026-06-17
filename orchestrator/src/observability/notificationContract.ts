/**
 * Contrat CANONIQUE des notifications e-mail (Priorité 5).
 *
 * Source de vérité partagée entre l'orchestrateur (émetteur) et la Supabase Edge
 * Function `notify-email` (récepteur). La fonction Deno embarque une COPIE de ce
 * validateur (runtimes séparés Node/Deno) — toute évolution doit rester
 * synchronisée des deux côtés. Volontairement sans dépendance (pas de Zod) pour
 * porter à l'identique sur les deux runtimes.
 *
 * Garanties :
 *   - `to` est une adresse e-mail bien formée (validée en plus, côté fonction,
 *     comme appartenant au workspace — anti-relais) ;
 *   - l'expéditeur (`from`) n'est JAMAIS transporté par le payload : il est fixé
 *     côté fonction par la variable d'environnement EMAIL_FROM ;
 *   - `idempotencyKey` permet de dédupliquer les envois (retries).
 */

export type EmailNotificationType = 'hitl' | 'flux';

export interface EmailNotification {
    workspaceId: string;
    nodeId: string;
    /** Adresse e-mail destinataire (doit appartenir au workspace — vérifié côté fonction). */
    to: string;
    type: EmailNotificationType;
    /** Données de template (non sensibles : nom de nœud, statuts, lien app). */
    data: Record<string, unknown>;
    /** Clé d'idempotence — déduplique les envois en cas de retry. */
    idempotencyKey: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valide et normalise un payload de notification e-mail (runtime). */
export function parseEmailNotification(input: unknown): ParseResult<EmailNotification> {
    if (typeof input !== 'object' || input === null) {
        return { ok: false, error: 'payload doit être un objet' };
    }
    const o = input as Record<string, unknown>;

    const str = (k: string): string | null => (typeof o[k] === 'string' && o[k] ? (o[k] as string) : null);

    const workspaceId = str('workspaceId');
    const nodeId = str('nodeId');
    const to = str('to');
    const type = o.type;
    const idempotencyKey = str('idempotencyKey');

    if (!workspaceId) return { ok: false, error: 'workspaceId requis' };
    if (!nodeId) return { ok: false, error: 'nodeId requis' };
    if (!to) return { ok: false, error: 'to requis' };
    if (!EMAIL_RE.test(to)) return { ok: false, error: 'to: adresse e-mail invalide' };
    if (type !== 'hitl' && type !== 'flux') return { ok: false, error: "type doit être 'hitl' ou 'flux'" };
    if (!idempotencyKey) return { ok: false, error: 'idempotencyKey requis' };
    if (typeof o.data !== 'object' || o.data === null) {
        return { ok: false, error: 'data requis (objet)' };
    }

    return {
        ok: true,
        value: {
            workspaceId,
            nodeId,
            to,
            type,
            data: o.data as Record<string, unknown>,
            idempotencyKey,
        },
    };
}

export function isValidEmail(addr: string): boolean {
    return EMAIL_RE.test(addr);
}
