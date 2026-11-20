/**
 * Pont LINK ↔ OrganiGrad — décisions de CIRCUIT (recette « Atelier Boréal »).
 *
 * Distinct de `linkBridgeRoutes.ts` (décisions sur `hybrid_nodes`, autre métier) :
 * ici LINK relaie la décision d'un humain sur une `CircuitExecution` (choix du
 * sujet, correction, validation finale) et lit les dossiers du projet de la
 * conversation. Même transport : aucun Bearer, une ASSERTION D'ACTEUR signée par
 * le hub Synapse (`X-Synapse-Actor`), clé publique épinglée, requestId à usage unique.
 *
 * « OrganiGrad décide » : après la signature, OrganiGrad revalide dans SA base
 *   1. la référence canonique du projet (origine, projet, workspace) ;
 *   2. l'appartenance de `organigradUserId` au workspace et son rôle (scope
 *      `human:approve` / `human:reject`) ;
 *   3. que l'exécution appartient à CE projet ;
 *   4. l'assignation humaine de l'étape (`decideStep` : NOT_ASSIGNED_APPROVER) —
 *      le Gardien (bot de contrôle) ne peut donc jamais valider le dossier.
 * Le corps ne porte ni acteur, ni workspace, ni projet, ni canal : le canal est
 * forcé à `link`. Une décision identique (même clé d'idempotence) rend l'état
 * existant sans nouvelle transition. Ni assertion ni contenu ne sont journalisés.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { ArtifactReferenceSchema, CircuitDecisionSchema } from '@apps2026/contracts';
import { nativeProjectRef } from './projectRef.js';
import { hasScope, scopesForRole, SCOPES } from './scopes.js';
import { IdentityAssertionError, verifyActorAssertion, type ActorAssertionClaims } from './identityAssertions.js';
import { ReplayGuard, type LinkBridgeConfig } from './linkBridgeRoutes.js';
import { CircuitError, type CircuitExecution } from '../orchestration/circuits.js';
import type { PgCircuitStore } from '../state/pgCircuitStore.js';

export interface LinkCircuitBridgeDeps {
    sql: Sql;
    /** Absent → 404 sur toutes les routes de ce pont. */
    config: LinkBridgeConfig | undefined;
    appUrl?: string;
    storeFor(workspaceId: string): Pick<PgCircuitStore, 'runs' | 'getRun' | 'decide'>;
    /** Partagé avec le pont des nœuds : un `requestId` n'est accepté qu'une fois, toutes routes confondues. */
    replays?: ReplayGuard;
    now?: () => number;
}

const runIdParam = z.string().uuid();
/** Le corps est la décision du contrat partagé SANS `channel` (forcé) : rien d'autre n'est accepté. */
const decisionBody = z.object({
    stepId: z.string().min(1).max(128),
    choice: z.enum(['approve', 'revise']),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().uuid(),
    feedback: z.string().trim().max(4000).optional(),
    selectedArtifact: ArtifactReferenceSchema.optional(),
}).strict();

function singleHeader(value: string | string[] | undefined): string | null {
    if (typeof value !== 'string' || value.length === 0 || value.includes(',')) return null;
    return value;
}
function canonicalUrlMatches(appUrl: string | undefined, project: ActorAssertionClaims['project']): boolean {
    try { return nativeProjectRef(appUrl, project.projectId, project.workspaceId).canonicalUrl === project.canonicalUrl; } catch { return false; }
}
function belongsToProject(run: CircuitExecution, project: ActorAssertionClaims['project']): boolean {
    const bound = run.definition.project;
    return bound.sourceApp === 'organigrad' && bound.projectId === project.projectId && bound.workspaceId === project.workspaceId;
}

export function registerLinkCircuitBridgeRoutes(app: FastifyInstance, deps: LinkCircuitBridgeDeps): void {
    const replays = deps.replays ?? new ReplayGuard();
    const nowSeconds = () => deps.now?.() ?? Math.floor(Date.now() / 1000);

    /** Transport + identité, communs aux deux routes. Rend les claims ou la réponse déjà envoyée. */
    async function authenticate(headers: Record<string, string | string[] | undefined>, reply: FastifyReply): Promise<ActorAssertionClaims | FastifyReply> {
        reply.header('Cache-Control', 'private, no-store');
        const config = deps.config;
        if (!config) return reply.code(404).send({ error: 'LINK_BRIDGE_NOT_FOUND' });
        if (headers.authorization !== undefined) return reply.code(400).send({ error: 'UNEXPECTED_AUTHORIZATION' });
        const assertion = singleHeader(headers['x-synapse-actor']);
        if (!assertion) return reply.code(400).send({ error: 'ACTOR_ASSERTION_REQUIRED' });
        let claims: ActorAssertionClaims;
        try {
            claims = verifyActorAssertion(assertion, { hubPublicKeys: config.hubPublicKeys, now: nowSeconds() });
        } catch (err) {
            return reply.code(403).send({ error: 'ACTOR_ASSERTION_INVALID', code: err instanceof IdentityAssertionError ? err.code : 'UNKNOWN' });
        }
        if (!replays.accept(claims.requestId, nowSeconds() * 1000)) return reply.code(409).send({ error: 'ACTOR_ASSERTION_REPLAYED' });
        if (!canonicalUrlMatches(deps.appUrl, claims.project)) return reply.code(403).send({ error: 'UNQUALIFIED_PROJECT_REFERENCE' });
        return claims;
    }
    /** Le rôle vient de NOTRE table des membres, jamais du hub ni de LINK. */
    async function memberScopes(claims: ActorAssertionClaims): Promise<readonly string[] | null> {
        const members = await deps.sql<{ role: string }[]>`
            select role from public.workspace_members where workspace_id = ${claims.project.workspaceId} and user_id = ${claims.organigradUserId} limit 1`;
        const role = members[0]?.role;
        return role ? scopesForRole(role) : null;
    }
    const failure = (reply: FastifyReply, error: unknown) => {
        if (error instanceof CircuitError) return reply.code(error.status).send({ error: error.code });
        if (error instanceof Error && error.name === 'ZodError') return reply.code(400).send({ error: 'INVALID_LINK_BRIDGE_INPUT' });
        app.log.error({ errorType: error instanceof Error ? error.name : 'Unknown' }, 'Link circuit bridge failed');
        return reply.code(503).send({ error: 'LINK_BRIDGE_UNAVAILABLE' });
    };

    // ── Lecture des dossiers du projet de la conversation ────────────────────
    app.get('/api/link-bridge/circuit-runs', async (req, reply) => {
        const claims = await authenticate(req.headers, reply);
        if (!('requestId' in claims)) return claims;
        try {
            const scopes = await memberScopes(claims);
            if (!scopes || !hasScope(scopes, SCOPES.executionRead)) return reply.code(403).send({ error: 'FORBIDDEN' });
            const runs = (await deps.storeFor(claims.project.workspaceId).runs()).filter((run) => belongsToProject(run, claims.project));
            return { project: { projectId: claims.project.projectId, workspaceId: claims.project.workspaceId }, runs };
        } catch (error) { return failure(reply, error); }
    });

    // ── Décision humaine relayée sur une exécution de circuit ────────────────
    app.post<{ Params: { runId: string }; Body: unknown }>('/api/link-bridge/circuit-runs/:runId/decisions', async (req, reply) => {
        const claims = await authenticate(req.headers, reply);
        if (!('requestId' in claims)) return claims;
        const runParsed = runIdParam.safeParse(req.params.runId);
        const bodyParsed = decisionBody.safeParse(req.body);
        if (!runParsed.success || !bodyParsed.success) return reply.code(400).send({ error: 'INVALID_LINK_BRIDGE_INPUT' });
        try {
            const scopes = await memberScopes(claims);
            const required = bodyParsed.data.choice === 'approve' ? SCOPES.humanApprove : SCOPES.humanReject;
            if (!scopes || !hasScope(scopes, required)) return reply.code(403).send({ error: 'FORBIDDEN' });
            const store = deps.storeFor(claims.project.workspaceId);
            const before = await store.getRun(runParsed.data);
            // Un dossier d'un autre projet n'existe pas pour cet acteur.
            if (!belongsToProject(before, claims.project)) return reply.code(404).send({ error: 'RUN_NOT_FOUND' });
            const decision = CircuitDecisionSchema.parse({ ...bodyParsed.data, feedback: bodyParsed.data.feedback ?? '', channel: 'link' });
            const run = await store.decide(runParsed.data, decision, { id: claims.organigradUserId, kind: 'human' });
            return { run, replayed: run.version === before.version };
        } catch (error) { return failure(reply, error); }
    });
}
