/**
 * Edge Function : notify-email
 *
 * Reçoit une requête POST de l'orchestrateur, construit le HTML via les
 * templates et envoie l'email via Resend, puis journalise dans `notifications`.
 *
 * DURCISSEMENT (Priorité 5) :
 *   1. Vérification du CALLER : seule une requête portant la clé service_role en
 *      Bearer est acceptée (l'orchestrateur). Le SPA ne peut PLUS appeler
 *      directement cette fonction (anti-relais).
 *   2. Validation runtime du payload (contrat partagé — copie du validateur de
 *      orchestrator/src/observability/notificationContract.ts, runtimes séparés).
 *   3. Restriction du DESTINATAIRE : `to` doit correspondre exactement à l'email
 *      configuré sur le nœud (`hybrid_nodes.notification_channels.email`) pour ce
 *      workspace — pas d'envoi vers une adresse arbitraire.
 *   4. Expéditeur (`from`) JAMAIS issu de la requête : fixé par EMAIL_FROM.
 *   5. Idempotence : la clé est RÉSERVÉE en base (`status = 'pending'`) AVANT
 *      l'envoi. C'est la contrainte d'unicité qui arbitre entre deux
 *      invocations concurrentes, donc une seule envoie. Vérifier avant d'agir
 *      (SELECT puis envoi) laissait passer deux e-mails.
 *   6. `response.ok` Resend vérifié ; échec réel journalisé.
 *
 * Variables d'environnement :
 *   RESEND_API_KEY            — clé API Resend (absent : mode simulé en dev)
 *   EMAIL_FROM                — expéditeur fixe
 *   SUPABASE_URL              — injecté
 *   SUPABASE_SERVICE_ROLE_KEY — injecté ; sert AUSSI à authentifier le caller
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildHitlEmail, buildFluxEmail } from './templates.ts';
import type { HitlEmailData, FluxEmailData } from './templates.ts';

const RESEND_API = 'https://api.resend.com/emails';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailRequest {
    workspaceId: string;
    nodeId: string;
    to: string;
    type: 'hitl' | 'flux';
    data: HitlEmailData | FluxEmailData;
    idempotencyKey: string;
}

/** Copie du validateur canonique (cf. notificationContract.ts). */
function parsePayload(input: unknown): { ok: true; value: EmailRequest } | { ok: false; error: string } {
    if (typeof input !== 'object' || input === null) return { ok: false, error: 'payload invalide' };
    const o = input as Record<string, unknown>;
    const s = (k: string) => (typeof o[k] === 'string' && o[k] ? (o[k] as string) : null);
    const workspaceId = s('workspaceId');
    const nodeId = s('nodeId');
    const to = s('to');
    const idempotencyKey = s('idempotencyKey');
    if (!workspaceId) return { ok: false, error: 'workspaceId requis' };
    if (!nodeId) return { ok: false, error: 'nodeId requis' };
    if (!to || !EMAIL_RE.test(to)) return { ok: false, error: 'to: e-mail invalide' };
    if (o.type !== 'hitl' && o.type !== 'flux') return { ok: false, error: 'type invalide' };
    if (!idempotencyKey) return { ok: false, error: 'idempotencyKey requis' };
    if (typeof o.data !== 'object' || o.data === null) return { ok: false, error: 'data requis' };
    return {
        ok: true,
        value: { workspaceId, nodeId, to, type: o.type, data: o.data as HitlEmailData | FluxEmailData, idempotencyKey },
    };
}

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    // ── 1. Vérification du caller (anti-relais) ──────────────────────────────
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!serviceRoleKey || token !== serviceRoleKey) {
        return json({ error: 'unauthorized' }, 401);
    }

    // ── 2. Validation du payload ─────────────────────────────────────────────
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }
    const parsed = parsePayload(raw);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const { workspaceId, nodeId, to, type, data, idempotencyKey } = parsed.value;

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // ── 3. Restriction du destinataire au workflow ───────────────────────────
    const { data: node, error: nodeErr } = await supabase
        .from('hybrid_nodes')
        .select('notification_channels')
        .eq('id', nodeId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
    if (nodeErr) return json({ error: 'node lookup failed' }, 500);
    const allowed = (node?.notification_channels as { email?: string } | null)?.email ?? null;
    if (!allowed || allowed.toLowerCase() !== to.toLowerCase()) {
        // Le destinataire n'est pas celui prévu par le nœud → refus (anti-relais).
        return json({ error: 'recipient not authorized for this node' }, 403);
    }

    // ── 5. Idempotence : RÉSERVER la clé AVANT d'envoyer ─────────────────────
    //
    // L'ordre est le cœur de la garantie. Auparavant : SELECT, puis envoi, puis
    // INSERT. Deux invocations concurrentes portant la même clé passaient toutes
    // deux le SELECT avant que l'une n'atteigne l'INSERT — DEUX e-mails
    // partaient. L'index unique n'intervenait qu'après l'envoi, et son échec
    // était avalé par le catch : la seconde invocation répondait `ok: true` en
    // ayant envoyé un doublon, sans rien journaliser.
    //
    // Désormais c'est la base qui arbitre, atomiquement : celui qui obtient la
    // ligne envoie, l'autre est dédupliqué sans rien envoyer. `pending` est déjà
    // la valeur par défaut de la colonne et fait partie de sa contrainte CHECK —
    // aucune migration n'est nécessaire.
    const email = type === 'hitl' ? buildHitlEmail(data as HitlEmailData) : buildFluxEmail(data as FluxEmailData);

    const { data: reservation, error: reserveErr } = await supabase
        .from('notifications')
        .insert({
            workspace_id: workspaceId,
            node_id: nodeId,
            channel: 'email',
            target: to,
            message: email.text,
            status: 'pending',
            idempotency_key: idempotencyKey,
        })
        .select('id')
        .single();

    if (reserveErr) {
        // 23505 = violation d'unicité sur (workspace_id, idempotency_key) :
        // un autre envoi pour le même événement est en cours ou déjà fait.
        if (reserveErr.code === '23505') return json({ ok: true, deduped: true });
        console.error('[notify-email] réservation impossible');
        return json({ error: 'reservation failed' }, 500);
    }

    // ── Envoi ─────────────────────────────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('EMAIL_FROM') ?? 'Organigrad <no-reply@organigrad.app>';

    let status: 'sent' | 'failed' = 'sent';
    let errorMsg: string | null = null;
    let sentAt: string | null = null;

    if (!resendKey) {
        console.warn('[notify-email] RESEND_API_KEY absent — envoi simulé');
        sentAt = new Date().toISOString();
    } else {
        try {
            const resendRes = await fetch(RESEND_API, {
                method: 'POST',
                headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: fromEmail, // expéditeur fixe — jamais issu de la requête
                    to: [to],
                    subject: email.subject,
                    html: email.html,
                    text: email.text,
                }),
            });
            const resendBody = (await resendRes.json().catch(() => ({}))) as { id?: string; message?: string };
            if (!resendRes.ok) {
                throw new Error(`Resend ${resendRes.status}: ${resendBody.message ?? 'erreur'}`);
            }
            sentAt = new Date().toISOString();
        } catch (err) {
            status = 'failed';
            errorMsg = err instanceof Error ? err.message : String(err);
            console.error('[notify-email] échec envoi Resend'); // pas de contenu sensible loggé
        }
    }

    // ── 6. Clore la réservation ───────────────────────────────────────────────
    //
    // En cas d'ÉCHEC, la clé d'idempotence est remise à NULL. L'index unique est
    // partiel (`where idempotency_key is not null`) : la ligne d'audit du
    // rattrapage échoué est donc conservée, tout en laissant un retry légitime
    // repasser. Supprimer la ligne aurait effacé la trace de l'échec.
    try {
        await supabase
            .from('notifications')
            .update({
                status,
                error: errorMsg,
                sent_at: sentAt,
                ...(status === 'failed' ? { idempotency_key: null } : {}),
            })
            .eq('id', reservation.id);
    } catch {
        console.error('[notify-email] échec cloture audit DB');
    }

    return status === 'failed' ? json({ ok: false, error: errorMsg }, 502) : json({ ok: true, sentAt });
});

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
