/**
 * Pont LINK ↔ OrganiGrad — recette « Atelier Boréal ».
 *
 *   1. `POST /api/link-bridge/nodes/:nodeId/decision` — LINK relaie une décision
 *      humaine. Aucun Bearer : l'appel porte une ASSERTION D'ACTEUR signée par
 *      le hub Synapse (`X-Synapse-Actor`, JWS EdDSA, clé publique épinglée).
 *      « OrganiGrad décide » : après la signature, OrganiGrad vérifie DANS SA
 *      BASE que `organigradUserId` est membre du workspace avec un rôle qui
 *      accorde `human:approve` / `human:reject`, puis applique EXACTEMENT la
 *      même séquence qu'une approbation humaine (`decideNode` de pgServer).
 *      Aucune confiance n'est accordée à LINK.
 *   2. `POST /api/identity-links/:action` (`propose|confirm|revoke`) — derrière
 *      le hook d'auth : une session HUMAINE signe une attestation OrganiGrad
 *      (`organigradUserId = req.userId`, jamais le corps) relayée au hub.
 *
 * Ni l'assertion ni l'attestation ne sont jamais journalisées.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Sql } from 'postgres';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { nativeProjectRef } from './projectRef.js';
import { hasScope, scopesForRole, SCOPES } from './scopes.js';
import { safeFetch, type SafeFetchDeps } from '../net/ssrfGuard.js';
import type { JsonObject } from '../domain/types.js';
import {
    attestationLifetimeSeconds,
    IdentityAssertionError,
    signOrganigradAttestation,
    verifyActorAssertion,
    type ActorAssertionClaims,
    type OrganigradAttestationClaims,
} from './identityAssertions.js';

export interface LinkBridgeConfig {
    /** Clés publiques Ed25519 épinglées du hub `{kid: pem}`. */
    hubPublicKeys: Record<string, string>;
    /** `kid` annoncé dans les attestations OrganiGrad. */
    signingKid: string;
    /** PEM PKCS8 de la clé privée Ed25519 d'OrganiGrad. */
    signingPrivateKeyPem: string;
    /** Base https du hub (`{hub}/api/identity-links/<action>`). */
    hubUrl: string;
}

export interface NodeDecisionResult {
    ok: true;
    resumed: boolean;
    waitingHumanAt: string | null;
}

export interface LinkBridgeRouteDeps {
    sql: Sql;
    /** Absent → toutes les routes du pont répondent 404. */
    config: LinkBridgeConfig | undefined;
    appUrl?: string;
    /**
     * Séquence de décision partagée avec `/api/nodes/:id/approve|reject`
     * (pgServer). Renvoie le résultat ou la réponse d'erreur déjà envoyée.
     */
    decideNode: (
        req: FastifyRequest,
        reply: FastifyReply,
        nodeId: string,
        decision: 'approved' | 'rejected',
        feedback?: string,
        auditMetadata?: JsonObject,
    ) => Promise<NodeDecisionResult | FastifyReply>;
    fetchImpl?: typeof fetch;
    fetchLookup?: SafeFetchDeps['lookup'];
    /** Horloge en secondes Unix (tests). */
    now?: () => number;
}

const DECISION_PATH_PREFIX = '/api/link-bridge/';
/** Fenêtre anti-rejeu d'un `requestId` (ms) — couvre largement les 60 s de vie d'une assertion. */
export const REPLAY_WINDOW_MS = 120_000;
const HUB_TIMEOUT_MS = 8_000;
const HUB_MAX_RESPONSE_BYTES = 64 * 1024;

export function isLinkBridgeDecisionPath(path: string): boolean {
    return path.startsWith(DECISION_PATH_PREFIX);
}

/** Ensemble en mémoire des `requestId` déjà acceptés, avec expiration. */
export class ReplayGuard {
    private readonly seen = new Map<string, number>();
    constructor(private readonly windowMs: number = REPLAY_WINDOW_MS) {}

    /** `true` si l'identifiant est nouveau (et le marque vu) ; `false` s'il rejoue. */
    accept(id: string, nowMs: number = Date.now()): boolean {
        this.sweep(nowMs);
        if (this.seen.has(id)) return false;
        this.seen.set(id, nowMs + this.windowMs);
        return true;
    }

    private sweep(nowMs: number): void {
        for (const [id, expiresAt] of this.seen) {
            if (expiresAt <= nowMs) this.seen.delete(id);
        }
    }
}

const decisionBody = z
    .object({ decision: z.enum(['approved', 'rejected']), reason: z.string().max(2000).optional() })
    .strict();
const nodeIdParam = z.string().uuid();
const identityAction = z.enum(['propose', 'confirm', 'revoke']);
const identityBodies = {
    propose: z.object({ linkUserId: z.string().uuid() }).strict(),
    confirm: z.object({ linkId: z.string().uuid() }).strict(),
    revoke: z.object({ linkId: z.string().uuid(), reason: z.string().min(1).max(1000) }).strict(),
} as const;
/** Vue de lien d'identité renvoyée par le hub — seuls ces champs sont propagés. */
const hubLinkView = z
    .object({
        linkId: z.string().uuid(),
        status: z.string().min(1).max(64),
        proposedBy: z.string().max(256).nullable().optional(),
        createdAt: z.string().max(64).nullable().optional(),
        confirmedAt: z.string().max(64).nullable().optional(),
        revokedAt: z.string().max(64).nullable().optional(),
    })
    .passthrough();
const hubErrorView = z.object({ error: z.string().min(1).max(128), code: z.string().max(128).optional() }).passthrough();

/** Une assertion valide ne contient jamais de virgule : un en-tête dupliqué (joint par Node) est refusé. */
function singleHeader(value: string | string[] | undefined): string | null {
    if (typeof value !== 'string' || value.length === 0 || value.includes(',')) return null;
    return value;
}

function canonicalUrlMatches(appUrl: string | undefined, project: ActorAssertionClaims['project']): boolean {
    try {
        const expected = nativeProjectRef(appUrl, project.projectId, project.workspaceId);
        return expected.canonicalUrl === project.canonicalUrl;
    } catch {
        return false;
    }
}

export function registerLinkBridgeRoutes(app: FastifyInstance, deps: LinkBridgeRouteDeps): void {
    const replays = new ReplayGuard();
    const nowSeconds = () => deps.now?.() ?? Math.floor(Date.now() / 1000);

    // ── 1. Décision relayée par LINK, authentifiée par l'assertion du hub ──────
    app.post<{ Params: { nodeId: string }; Body: unknown }>(
        '/api/link-bridge/nodes/:nodeId/decision',
        async (req, reply) => {
            reply.header('Cache-Control', 'private, no-store');
            const config = deps.config;
            if (!config) return reply.code(404).send({ error: 'LINK_BRIDGE_NOT_FOUND' });
            // Cette route ne parle jamais Bearer : un jeton qui arrive ici est
            // une erreur de câblage côté LINK, refusée avant tout traitement.
            if (req.headers.authorization !== undefined) return reply.code(400).send({ error: 'UNEXPECTED_AUTHORIZATION' });
            const assertion = singleHeader(req.headers['x-synapse-actor']);
            if (!assertion) return reply.code(400).send({ error: 'ACTOR_ASSERTION_REQUIRED' });
            const nodeParsed = nodeIdParam.safeParse(req.params.nodeId);
            const bodyParsed = decisionBody.safeParse(req.body);
            if (!nodeParsed.success || !bodyParsed.success) return reply.code(400).send({ error: 'INVALID_LINK_BRIDGE_INPUT' });
            const nodeId = nodeParsed.data;
            const { decision, reason } = bodyParsed.data;

            let claims: ActorAssertionClaims;
            try {
                claims = verifyActorAssertion(assertion, { hubPublicKeys: config.hubPublicKeys, now: nowSeconds() });
            } catch (err) {
                const code = err instanceof IdentityAssertionError ? err.code : 'UNKNOWN';
                return reply.code(403).send({ error: 'ACTOR_ASSERTION_INVALID', code });
            }
            if (!replays.accept(claims.requestId, nowSeconds() * 1000)) {
                return reply.code(409).send({ error: 'ACTOR_ASSERTION_REPLAYED' });
            }
            if (!canonicalUrlMatches(deps.appUrl, claims.project)) {
                return reply.code(403).send({ error: 'UNQUALIFIED_PROJECT_REFERENCE' });
            }

            try {
                // Le nœud doit exister DANS le workspace affirmé par le hub —
                // jamais résolu à partir d'un autre workspace.
                const nodes = await deps.sql<{ id: string }[]>`
                    select id from public.hybrid_nodes
                     where workspace_id = ${claims.project.workspaceId} and id = ${nodeId}
                     limit 1
                `;
                if (!nodes[0]) return reply.code(404).send({ error: 'NODE_NOT_FOUND', nodeId });

                // « OrganiGrad décide » : le rôle vient de NOTRE table des membres.
                const members = await deps.sql<{ role: string }[]>`
                    select role from public.workspace_members
                     where workspace_id = ${claims.project.workspaceId} and user_id = ${claims.organigradUserId}
                     limit 1
                `;
                const role = members[0]?.role;
                const scopes = role ? scopesForRole(role) : [];
                const required = decision === 'approved' ? SCOPES.humanApprove : SCOPES.humanReject;
                if (!role || !hasScope(scopes, required)) return reply.code(403).send({ error: 'FORBIDDEN' });

                // Identité établie : même contexte qu'une session humaine vérifiée.
                req.workspaceId = claims.project.workspaceId;
                req.userId = claims.organigradUserId;
                req.scopes = scopes;
                req.apiKeyId = undefined;

                const outcome = await deps.decideNode(req, reply, nodeId, decision, reason, {
                    via: 'link-bridge',
                    linkId: claims.linkId,
                    linkUserId: claims.linkUserId,
                    requestId: claims.requestId,
                    projectId: claims.project.projectId,
                });
                return outcome;
            } catch (error) {
                req.log.error({ errorType: error instanceof Error ? error.name : 'Unknown' }, 'Link bridge decision failed');
                return reply.code(503).send({ error: 'LINK_BRIDGE_UNAVAILABLE' });
            }
        },
    );

    // ── 2. Attestation humaine OrganiGrad → hub (derrière le hook d'auth) ─────
    app.post<{ Params: { action: string }; Body: unknown }>('/api/identity-links/:action', async (req, reply) => {
        reply.header('Cache-Control', 'private, no-store');
        const config = deps.config;
        if (!config) return reply.code(404).send({ error: 'LINK_BRIDGE_NOT_FOUND' });
        const actionParsed = identityAction.safeParse(req.params.action);
        if (!actionParsed.success) return reply.code(404).send({ error: 'LINK_BRIDGE_NOT_FOUND' });
        const action = actionParsed.data;
        if (!req.workspaceId) return reply.code(401).send({ error: 'AUTH_REQUIRED' });
        // Seule une session humaine vérifiée peut lier SA propre identité.
        if (!req.userId || req.apiKeyId) return reply.code(403).send({ error: 'HUMAN_SESSION_REQUIRED' });
        const bodyParsed = identityBodies[action].safeParse(req.body);
        if (!bodyParsed.success) return reply.code(400).send({ error: 'INVALID_IDENTITY_LINK_INPUT' });

        const purpose = `identity-link-${action}` as const;
        const issuedAt = nowSeconds();
        const base = {
            version: '1.0' as const,
            issuerApp: 'organigrad' as const,
            audienceApp: 'synapse-hub' as const,
            organigradUserId: req.userId,
            workspaceId: req.workspaceId,
            requestId: randomUUID(),
            issuedAt,
            expiresAt: issuedAt + attestationLifetimeSeconds(purpose),
        };
        const claims: OrganigradAttestationClaims =
            action === 'propose'
                ? { ...base, purpose: 'identity-link-propose', linkUserId: (bodyParsed.data as { linkUserId: string }).linkUserId }
                : action === 'confirm'
                  ? { ...base, purpose: 'identity-link-confirm', linkId: (bodyParsed.data as { linkId: string }).linkId }
                  : { ...base, purpose: 'identity-link-revoke', ...(bodyParsed.data as { linkId: string; reason: string }) };

        let attestation: string;
        try {
            attestation = signOrganigradAttestation(claims, { kid: config.signingKid, privateKeyPem: config.signingPrivateKeyPem });
        } catch {
            return reply.code(503).send({ error: 'IDENTITY_SIGNING_UNAVAILABLE' });
        }

        let res: Response;
        try {
            const url = new URL(`/api/identity-links/${action}`, config.hubUrl);
            if (url.protocol !== 'https:') return reply.code(503).send({ error: 'IDENTITY_HUB_UNAVAILABLE' });
            res = await safeFetch(
                url.toString(),
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', accept: 'application/json' },
                    body: JSON.stringify({ assertion: attestation }),
                },
                // safeFetch suit les redirections manuellement ; maxRedirects: 0 = `redirect: 'error'`.
                { allowHttp: false, maxRedirects: 0, timeoutMs: HUB_TIMEOUT_MS, maxResponseBytes: HUB_MAX_RESPONSE_BYTES },
                { fetchImpl: deps.fetchImpl, lookup: deps.fetchLookup },
            );
        } catch {
            return reply.code(503).send({ error: 'IDENTITY_HUB_UNAVAILABLE' });
        }

        let payload: unknown;
        try {
            payload = await res.json();
        } catch {
            return reply.code(502).send({ error: 'IDENTITY_HUB_BAD_RESPONSE' });
        }
        if (res.status === 200 || res.status === 201) {
            const view = hubLinkView.safeParse(payload);
            if (!view.success) return reply.code(502).send({ error: 'IDENTITY_HUB_BAD_RESPONSE' });
            const { linkId, status, proposedBy, createdAt, confirmedAt, revokedAt } = view.data;
            return reply.code(res.status).send({
                linkId,
                status,
                proposedBy: proposedBy ?? null,
                createdAt: createdAt ?? null,
                confirmedAt: confirmedAt ?? null,
                revokedAt: revokedAt ?? null,
            });
        }
        if ([400, 403, 409, 415, 429, 503].includes(res.status)) {
            const err = hubErrorView.safeParse(payload);
            if (!err.success) return reply.code(502).send({ error: 'IDENTITY_HUB_BAD_RESPONSE' });
            return reply.code(res.status).send({ error: err.data.error, ...(err.data.code ? { code: err.data.code } : {}) });
        }
        return reply.code(502).send({ error: 'IDENTITY_HUB_BAD_RESPONSE' });
    });
}
