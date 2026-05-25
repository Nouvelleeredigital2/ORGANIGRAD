/**
 * Edge Function : notify-email
 *
 * Reçoit une requête POST du notifier orchestrateur, construit le HTML via
 * les templates et envoie l'email via Resend. Journalise dans `notifications`.
 *
 * Corps attendu (JSON) :
 * {
 *   workspaceId : string
 *   nodeId      : string
 *   to          : string   — adresse email destinataire
 *   type        : 'hitl' | 'flux'
 *   data        : HitlEmailData | FluxEmailData
 * }
 *
 * Variables d'environnement requises :
 *   RESEND_API_KEY            — clé API Resend (optionnel en dev : mode simulé)
 *   EMAIL_FROM                — expéditeur (ex. "Organigrad <no-reply@organigrad.app>")
 *   SUPABASE_URL              — injecté automatiquement
 *   SUPABASE_SERVICE_ROLE_KEY — injecté automatiquement
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildHitlEmail, buildFluxEmail } from './templates.ts';
import type { HitlEmailData, FluxEmailData } from './templates.ts';

const RESEND_API = 'https://api.resend.com/emails';

interface EmailRequest {
    workspaceId: string;
    nodeId: string;
    to: string;
    type: 'hitl' | 'flux';
    data: HitlEmailData | FluxEmailData;
}

interface ResendResponse {
    id?: string;
    statusCode?: number;
    message?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    let body: EmailRequest;
    try {
        body = (await req.json()) as EmailRequest;
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const { workspaceId, nodeId, to, type, data } = body;
    if (!workspaceId || !nodeId || !to || !type || !data) {
        return json({ error: 'Champs requis manquants : workspaceId, nodeId, to, type, data' }, 400);
    }

    // ── Rendu du template ────────────────────────────────────────────────────

    const email =
        type === 'hitl'
            ? buildHitlEmail(data as HitlEmailData)
            : buildFluxEmail(data as FluxEmailData);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('EMAIL_FROM') ?? 'Organigrad <no-reply@organigrad.app>';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── Envoi via Resend ─────────────────────────────────────────────────────

    let status: 'sent' | 'failed' = 'sent';
    let errorMsg: string | null = null;
    let sentAt: string | null = null;

    if (!resendKey) {
        // Mode dégradé : pas d'envoi réel (dev sans clé configurée)
        console.warn('[notify-email] RESEND_API_KEY non défini — envoi simulé');
        console.info(`[notify-email] SIMULÉ → ${to} | ${email.subject}`);
        sentAt = new Date().toISOString();
    } else {
        try {
            const resendRes = await fetch(RESEND_API, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: fromEmail,
                    to: [to],
                    subject: email.subject,
                    html: email.html,
                    text: email.text,
                }),
            });

            const resendBody = (await resendRes.json()) as ResendResponse;

            if (!resendRes.ok) {
                throw new Error(
                    `Resend ${resendRes.status}: ${resendBody.message ?? JSON.stringify(resendBody)}`,
                );
            }

            sentAt = new Date().toISOString();
            console.info(`[notify-email] envoyé → ${to} | id=${resendBody.id ?? '?'}`);
        } catch (err) {
            status = 'failed';
            errorMsg = err instanceof Error ? err.message : String(err);
            console.error('[notify-email] échec envoi Resend', errorMsg);
        }
    }

    // ── Audit dans `notifications` (service_role, bypass RLS) ────────────────

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false },
        });

        await supabase.from('notifications').insert({
            workspace_id: workspaceId,
            node_id: nodeId,
            channel: 'email',
            target: to,
            subject: email.subject,
            message: email.text,
            status,
            error: errorMsg,
            sent_at: sentAt,
        });
    } catch (dbErr) {
        console.error('[notify-email] échec audit DB', dbErr);
    }

    if (status === 'failed') {
        return json({ ok: false, error: errorMsg }, 500);
    }

    return json({ ok: true, sentAt });
});

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}
