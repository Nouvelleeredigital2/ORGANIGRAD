/**
 * Pont LINK ↔ OrganiGrad, décisions de CIRCUIT (recette « Atelier Boréal »).
 *
 * Serveur Fastify réel (`buildPgServer`) sur PGlite avec la vraie migration des
 * circuits. L'assertion d'acteur est construite ici avec `node:crypto` seul.
 * La route `/api/link-bridge/nodes/:nodeId/decision` (hybrid_nodes) n'est PAS
 * réutilisée : une décision de `CircuitExecution` passe par `PgCircuitStore.decide`.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { Sql } from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CircuitDefinitionSchema, type ArtifactReference } from '@apps2026/contracts';
import type { LinkBridgeConfig } from '../src/api/linkBridgeRoutes.js';
import { startExecution, completeStep, type CircuitExecution } from '../src/orchestration/circuits.js';
import { actorBodySha256 } from '../src/api/identityAssertions.js';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '99999999-9999-4999-8999-999999999999';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const OTHER_PROJECT = '23232323-2323-4232-8232-232323232323';
const OWNER = '33333333-3333-4333-8333-333333333333';
const MEMBER = '34343434-3434-4343-8343-343434343434';
const VIEWER = '44444444-4444-4444-8444-444444444444';
const STRANGER = '55555555-5555-4555-8555-555555555555';
const ERIC = '66666666-6666-4666-8666-666666666666';
const GUARDIAN = '67676767-6767-4676-8676-676767676767';
const APP_URL = 'https://organigrad.example';
const CANONICAL = `${APP_URL}/?v=projects&project=${PROJECT}&workspace=${WS}`;

const hub = generateKeyPairSync('ed25519');
const orga = generateKeyPairSync('ed25519');
const pem = (k: import('node:crypto').KeyObject, kind: 'public' | 'private') =>
    kind === 'public' ? (k.export({ type: 'spki', format: 'pem' }) as string) : (k.export({ type: 'pkcs8', format: 'pem' }) as string);
const config: LinkBridgeConfig = { hubPublicKeys: { 'hub-2026': pem(hub.publicKey, 'public') }, signingKid: 'organigrad-2026', signingPrivateKeyPem: pem(orga.privateKey, 'private'), hubUrl: 'https://hub.example' };

let now = 1_800_000_000;
const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
function jws(claims: Record<string, unknown>, key = hub.privateKey, header: Record<string, unknown> = {}): string {
    const h = b64(JSON.stringify({ alg: 'EdDSA', typ: 'synapse-identity-actor+jwt', kid: 'hub-2026', ...header }));
    const p = b64(JSON.stringify(claims));
    return `${h}.${p}.${b64(sign(null, Buffer.from(`${h}.${p}`), key))}`;
}
/** Une assertion par appel : LINK résout un acteur (requestId neuf) à chaque décision. */
const actor = (over: Record<string, unknown> = {}) => ({
    version: '1.0', issuerApp: 'synapse-hub', audienceApp: 'organigrad',
    linkId: randomUUID(), linkUserId: randomUUID(), organigradUserId: OWNER,
    project: { sourceApp: 'organigrad', workspaceId: WS, projectId: PROJECT, canonicalUrl: CANONICAL },
    requestId: randomUUID(), issuedAt: now, expiresAt: now + 60, ...over,
});

const definition = CircuitDefinitionSchema.parse({ name: 'TEST FICTIF — Atelier Boréal', project: { sourceApp: 'organigrad', projectId: PROJECT, workspaceId: WS, canonicalUrl: CANONICAL }, steps: [
    { id: 'veille', kind: 'watch', assigneeId: ERIC, validatorKind: 'bot', instructions: 'Veille fictive' },
    { id: 'selection', kind: 'selection', assigneeId: OWNER, validatorKind: 'human', instructions: 'Choisir', correctionStepId: 'veille' },
    { id: 'redaction', kind: 'writing', assigneeId: ERIC, validatorKind: 'bot', instructions: 'Rédiger' },
    { id: 'controle', kind: 'control', assigneeId: GUARDIAN, validatorKind: 'bot', instructions: 'Contrôler sans valider' },
    { id: 'validation', kind: 'approval', assigneeId: OWNER, validatorKind: 'human', instructions: 'Valider', correctionStepId: 'redaction' }] });
const artifact = (kind: ArtifactReference['kind'], version = 1): ArtifactReference => ({ id: `${kind}-${version}`, kind, version, sourceApp: 'atelier-orvion', canonicalUrl: `https://orvion.example/dossiers/boreal/${kind}/${version}` });

let db: PGlite;
function adapter(client: { query: (s: string, v?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql {
    const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => (await client.query(strings.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
    return Object.assign(fn, { json: JSON.stringify, array: (v: unknown) => v, begin: (cb: (sql: Sql) => unknown) => db.transaction((tx) => Promise.resolve(cb(adapter(tx)))) }) as unknown as Sql;
}
const state = async (runId: string) => (await db.query<{ state: CircuitExecution }>('select state from public.circuit_executions where id=$1', [runId])).rows[0]!.state;
async function persist(run: CircuitExecution, workspaceId = WS, projectId = PROJECT) {
    await db.query('update public.circuit_executions set state=$1,version=$2 where id=$3 and workspace_id=$4', [JSON.stringify(run), run.version, run.id, workspaceId]);
    void projectId;
}
/** Un dossier prêt pour la sélection humaine : veille livrée avec deux sujets. */
async function readyForSelection(runId: string) {
    const run = completeStep(startExecution(runId, definition, 1), 'veille', 1, [artifact('watch'), artifact('subject'), { ...artifact('subject'), id: 'subject-2' }]);
    await persist(run); return run;
}
/** Un dossier arrivé à la validation finale (article, contrôle) : selection déjà décidée. */
async function readyForApproval(runId: string) {
    let run = await readyForSelection(runId);
    const { decideStep } = await import('../src/orchestration/circuits.js');
    run = decideStep(run, { stepId: 'selection', expectedVersion: run.version, choice: 'approve', feedback: '', channel: 'organigrad', selectedArtifact: artifact('subject'), idempotencyKey: randomUUID() }, { id: OWNER, kind: 'human' });
    run = completeStep(run, 'redaction', run.version, [artifact('article')]);
    run = completeStep(run, 'controle', run.version, [artifact('review')]);
    await persist(run); return run;
}
let runId: string, otherProjectRunId: string;
beforeEach(async () => {
    now = 1_800_000_000; runId = randomUUID(); otherProjectRunId = randomUUID();
    db = new PGlite();
    await db.exec(`create role authenticated;create role anon;create role service_role;
        create table public.workspaces(id uuid primary key);
        create table public.projects(id uuid primary key,workspace_id uuid not null references workspaces(id),archived_at timestamptz);
        create function public.is_workspace_member(uuid) returns boolean language sql as $$select true$$;
        create table workspace_members(workspace_id uuid, user_id uuid, role text, primary key(workspace_id,user_id));
        create table workspace_api_keys(id uuid primary key, workspace_id uuid, key_hash text, scopes text[], expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz);
        create table hybrid_nodes(id uuid primary key, workspace_id uuid, type text, nom text, status text default 'IDLE');
        create table audit_log(id bigint generated always as identity, workspace_id text, actor_kind text, actor_id text, action text, resource_type text, resource_id text, result text, metadata jsonb, ip text, request_id text, created_at timestamptz default now());
        insert into workspaces values ('${WS}'),('${OTHER_WS}'); insert into projects values ('${PROJECT}','${WS}',null),('${OTHER_PROJECT}','${WS}',null);
        insert into workspace_members values ('${WS}','${OWNER}','owner'),('${WS}','${MEMBER}','member'),('${WS}','${VIEWER}','viewer'),('${OTHER_WS}','${STRANGER}','owner');
        insert into hybrid_nodes(id,workspace_id,type,nom) values ('${ERIC}','${WS}','AGENT_IA','Eric'),('${GUARDIAN}','${WS}','AGENT_IA','Gardien');`);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260911150000_circuits.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260924120000_actor_assertion_requests.sql', import.meta.url), 'utf8'));
    for (const [id, projectId, def] of [[runId, PROJECT, definition], [otherProjectRunId, OTHER_PROJECT, { ...definition, project: { ...definition.project, projectId: OTHER_PROJECT, canonicalUrl: `${APP_URL}/?v=projects&project=${OTHER_PROJECT}&workspace=${WS}` } }]] as const) {
        await db.query('insert into public.team_circuits(id,workspace_id,project_id,definition,created_by) values($1,$2,$3,$4,$5)', [id, WS, projectId, JSON.stringify(def), OWNER]);
        const initial = startExecution(id, def, 1);
        await db.query('insert into public.circuit_executions(id,workspace_id,circuit_id,idempotency_key,created_by,version,state) values($1,$2,$1,$3,$4,$5,$6)', [id, WS, randomUUID(), OWNER, initial.version, JSON.stringify(initial)]);
    }
}, 30000);
afterEach(async () => { await db.close(); });

async function server(enabled = true) {
    const { buildPgServer } = await import('../src/api/pgServer.js');
    const app = buildPgServer({ sql: adapter(db), jwtSecret: 'jwt-secret', circuitsEnabled: true, linkBridge: enabled ? config : undefined, linkBridgeNow: () => now, notifierOptions: { appUrl: APP_URL } });
    await app.ready(); return app;
}
type App = import('fastify').FastifyInstance;
type AssertionInput=string|Record<string,unknown>|undefined;
const token=(input:AssertionInput,binding:Record<string,unknown>)=>typeof input==='string'?input:input===undefined?undefined:jws({...input,...binding});
const decide = (app: App, assertion: AssertionInput, body: Record<string, unknown>, id = runId, extra: Record<string, string> = {}) => {
    const route=`/api/link-bridge/circuit-runs/${id}/decisions`;
    const signed=token(assertion,{purpose:'circuit-decision',method:'POST',route,bodySha256:actorBodySha256(body),idempotencyKey:body.idempotencyKey});
    return app.inject({ method: 'POST', url: route, payload: body, headers: { ...(signed !== undefined ? { 'x-synapse-actor': signed } : {}), ...extra } });
};
const list = (app: App, assertion: AssertionInput) => {
    const signed=token(assertion,{purpose:'circuit-runs-list',method:'GET',route:'/api/link-bridge/circuit-runs',bodySha256:actorBodySha256(null),idempotencyKey:null});
    return app.inject({ method: 'GET', url: '/api/link-bridge/circuit-runs', headers: signed !== undefined ? { 'x-synapse-actor': signed } : {} });
};
const selection = (run: CircuitExecution, over: Record<string, unknown> = {}) => ({ stepId: 'selection', choice: 'approve', expectedVersion: run.version, idempotencyKey: randomUUID(), selectedArtifact: artifact('subject'), ...over });

describe('GET /api/link-bridge/circuit-runs', () => {
    it('lists only the runs of the asserted project, for a member, with references only', async () => {
        await readyForSelection(runId);
        const app = await server();
        try {
            const res = await list(app, actor({ organigradUserId: MEMBER }));
            expect(res.statusCode).toBe(200);
            expect(res.headers['cache-control']).toContain('no-store');
            const body = res.json() as { project: { projectId: string; workspaceId: string }; runs: CircuitExecution[] };
            expect(body.project).toEqual({ projectId: PROJECT, workspaceId: WS });
            expect(body.runs.map((r) => r.id)).toEqual([runId]);
            expect(body.runs[0]!.status).toBe('waiting_approval');
            expect(body.runs[0]!.outputs.veille).toHaveLength(3);
            expect(JSON.stringify(body)).not.toContain('content');
            // Un viewer lit (execution:read) ; un non-membre est refusé ; hors pont : 404.
            expect((await list(app, actor({ organigradUserId: VIEWER }))).statusCode).toBe(200);
            expect((await list(app, actor({ organigradUserId: STRANGER }))).statusCode).toBe(403);
            expect((await list(app, undefined)).statusCode).toBe(400);
        } finally { await app.close(); }
        const off = await server(false);
        try { expect((await list(off, actor())).statusCode).toBe(404); } finally { await off.close(); }
    });
});

describe('POST /api/link-bridge/circuit-runs/:runId/decisions', () => {
    it('applies a human selection relayed by LINK: channel forced to link, actor from the hub, one transition', async () => {
        const run = await readyForSelection(runId);
        const app = await server();
        try {
            const res = await decide(app, actor(), selection(run));
            expect(res.statusCode).toBe(200);
            const body = res.json() as { run: CircuitExecution; replayed: boolean };
            expect(body.replayed).toBe(false);
            expect(body.run.version).toBe(run.version + 1);
            expect(body.run.currentStepId).toBe('redaction');
            expect(body.run.outputs.selection).toEqual([artifact('subject')]);
            const last = body.run.history.at(-1)!;
            expect(last).toMatchObject({ kind: 'approved', actorId: OWNER, channel: 'link', stepId: 'selection' });
            expect((await state(runId)).version).toBe(run.version + 1);
        } finally { await app.close(); }
    });

    it('double clic : same idempotency key with a fresh assertion returns the existing receipt without a new transition', async () => {
        const run = await readyForSelection(runId);
        const app = await server();
        try {
            const body = selection(run);
            const first = await decide(app, actor(), body);
            expect(first.statusCode).toBe(200);
            const second = await decide(app, actor(), body);
            expect(second.statusCode).toBe(200);
            expect(second.json()).toMatchObject({ replayed: true });
            expect((second.json() as { run: CircuitExecution }).run.version).toBe(run.version + 1);
            expect((await state(runId)).history.filter((h) => h.kind === 'approved')).toHaveLength(1);
            // Même clé, décision différente : conflit, aucune transition.
            const conflict = await decide(app, actor(), { ...body, choice: 'revise', feedback: 'Autre sujet' });
            expect(conflict.statusCode).toBe(409);
            expect(conflict.json()).toEqual({ error: 'IDEMPOTENCY_CONFLICT' });
        } finally { await app.close(); }
    });

    it('is decided by OrganiGrad membership and assignment: non-member, viewer, unassigned member and the Guardian are refused', async () => {
        const run = await readyForApproval(runId);
        const app = await server();
        try {
            const approval = { stepId: 'validation', choice: 'approve', expectedVersion: run.version, idempotencyKey: randomUUID() };
            for (const [organigradUserId, status, error] of [[STRANGER, 403, 'FORBIDDEN'], [VIEWER, 403, 'FORBIDDEN'], [GUARDIAN, 403, 'FORBIDDEN'], [MEMBER, 403, 'NOT_ASSIGNED_APPROVER']] as const) {
                const res = await decide(app, actor({ organigradUserId }), approval);
                expect(res.statusCode, organigradUserId).toBe(status);
                expect(res.json()).toEqual({ error });
            }
            expect((await state(runId)).version).toBe(run.version);
            expect((await state(runId)).status).toBe('waiting_approval');
            // L'assigné humain valide ; le dossier devient prêt à publier, jamais publié ici.
            const ok = await decide(app, actor(), approval);
            expect(ok.statusCode).toBe(200);
            expect((ok.json() as { run: CircuitExecution }).run.status).toBe('ready_to_publish');
        } finally { await app.close(); }
    });

    it('never lets a bot step be "decided": the control step of the Guardian is not an approval', async () => {
        let run = await readyForSelection(runId);
        const { decideStep } = await import('../src/orchestration/circuits.js');
        run = decideStep(run, { stepId: 'selection', expectedVersion: run.version, choice: 'approve', feedback: '', channel: 'organigrad', selectedArtifact: artifact('subject'), idempotencyKey: randomUUID() }, { id: OWNER, kind: 'human' });
        run = completeStep(run, 'redaction', run.version, [artifact('article')]);
        await persist(run);
        const app = await server();
        try {
            const res = await decide(app, actor(), { stepId: 'controle', choice: 'approve', expectedVersion: run.version, idempotencyKey: randomUUID() });
            expect(res.statusCode).toBe(409);
            expect(res.json()).toEqual({ error: 'APPROVAL_NOT_PENDING' });
        } finally { await app.close(); }
    });

    it('refuses forged, expired, replayed and unqualified assertions before any business check', async () => {
        const run = await readyForSelection(runId);
        const app = await server();
        try {
            const other = generateKeyPairSync('ed25519');
            expect((await decide(app, jws({ version: '1.0', issuerApp: 'synapse-hub', audienceApp: 'organigrad', linkId: randomUUID(), linkUserId: randomUUID(), organigradUserId: OWNER, project: { sourceApp: 'organigrad', workspaceId: WS, projectId: PROJECT, canonicalUrl: CANONICAL }, requestId: randomUUID(), issuedAt: now, expiresAt: now + 60 }, other.privateKey), selection(run))).json()).toEqual({ error: 'ACTOR_ASSERTION_INVALID', code: 'BAD_SIGNATURE' });
            expect((await decide(app, actor({ issuedAt: now - 120, expiresAt: now - 60 }), selection(run))).json()).toEqual({ error: 'ACTOR_ASSERTION_INVALID', code: 'EXPIRED' });
            expect((await decide(app, actor({ audienceApp: 'link' }), selection(run))).statusCode).toBe(403);
            expect((await decide(app, actor({ project: { sourceApp: 'organigrad', workspaceId: WS, projectId: PROJECT, canonicalUrl: `https://evil.example/?v=projects&project=${PROJECT}&workspace=${WS}` } }), selection(run))).json()).toEqual({ error: 'UNQUALIFIED_PROJECT_REFERENCE' });
            expect((await decide(app, undefined, selection(run))).json()).toEqual({ error: 'ACTOR_ASSERTION_REQUIRED' });
            expect((await decide(app, actor(), selection(run), runId, { authorization: 'Bearer ok_x' })).json()).toEqual({ error: 'UNEXPECTED_AUTHORIZATION' });
            const boundBody=selection(run);
            const boundRoute=`/api/link-bridge/circuit-runs/${runId}/decisions`;
            const mismatched=jws({...actor(),purpose:'circuit-decision',method:'POST',route:boundRoute,bodySha256:actorBodySha256({...boundBody,feedback:'tampered'}),idempotencyKey:boundBody.idempotencyKey});
            expect((await decide(app,mismatched,boundBody)).json()).toEqual({error:'ACTOR_ASSERTION_INVALID',code:'REQUEST_BINDING_MISMATCH'});
            // Un corps invalide n'est pas réservé. Après une consommation valide,
            // le même requestId est refusé durablement.
            const requestId = randomUUID();
            const used = actor({ requestId });
            expect((await decide(app, used, { ...selection(run), choice: 'nope' })).statusCode).toBe(400);
            const valid=selection(run);
            expect((await decide(app, actor({ requestId }), valid)).statusCode).toBe(200);
            expect((await decide(app, actor({ requestId }), valid)).json()).toEqual({ error: 'ACTOR_ASSERTION_REPLAYED' });
            // Le corps ne porte jamais l'acteur, le canal ni le projet.
            for (const extra of [{ channel: 'organigrad' }, { organigradUserId: OWNER }, { workspaceId: WS }, { project: definition.project }]) {
                expect((await decide(app, actor(), { ...selection(run), ...extra })).statusCode, JSON.stringify(extra)).toBe(400);
            }
            expect((await state(runId)).version).toBe(run.version+1);
        } finally { await app.close(); }
    });

    it('binds the run to the asserted project: another project of the same workspace answers 404', async () => {
        await readyForSelection(runId);
        const app = await server();
        try {
            const res = await decide(app, actor(), { stepId: 'selection', choice: 'approve', expectedVersion: 2, idempotencyKey: randomUUID(), selectedArtifact: artifact('subject') }, otherProjectRunId);
            expect(res.statusCode).toBe(404);
            expect(res.json()).toEqual({ error: 'RUN_NOT_FOUND' });
            expect((await decide(app, actor(), selection(await state(runId)), randomUUID())).statusCode).toBe(404);
        } finally { await app.close(); }
    });

    it('concurrent decisions on the same version: exactly one wins, the other is stale', async () => {
        const run = await readyForSelection(runId);
        const app = await server();
        try {
            const [a, b] = await Promise.all([decide(app, actor(), selection(run)), decide(app, actor(), selection(run, { selectedArtifact: { ...artifact('subject'), id: 'subject-2' } }))]);
            const codes = [a.statusCode, b.statusCode].sort();
            expect(codes).toEqual([200, 409]);
            const stale = a.statusCode === 409 ? a : b;
            expect(stale.json()).toEqual({ error: 'STALE_EXECUTION' });
            const final = await state(runId);
            expect(final.version).toBe(run.version + 1);
            expect(final.history.filter((h) => h.kind === 'approved')).toHaveLength(1);
        } finally { await app.close(); }
    });

    it('stale version and correction: a revise from the final approval invalidates the produced outputs and returns to writing', async () => {
        const run = await readyForApproval(runId);
        const app = await server();
        try {
            expect((await decide(app, actor(), { stepId: 'validation', choice: 'approve', expectedVersion: run.version - 1, idempotencyKey: randomUUID() })).json()).toEqual({ error: 'STALE_EXECUTION' });
            const noFeedback = await decide(app, actor(), { stepId: 'validation', choice: 'revise', expectedVersion: run.version, idempotencyKey: randomUUID() });
            expect(noFeedback.statusCode).toBe(400);
            const res = await decide(app, actor(), { stepId: 'validation', choice: 'revise', expectedVersion: run.version, idempotencyKey: randomUUID(), feedback: 'Reprendre le paragraphe 2' });
            expect(res.statusCode).toBe(200);
            const revised = (res.json() as { run: CircuitExecution }).run;
            expect(revised.currentStepId).toBe('redaction');
            expect(revised.status).toBe('ready');
            expect(revised.outputs.redaction).toBeUndefined();
            expect(revised.outputs.controle).toBeUndefined();
            expect(revised.outputs.selection).toEqual([artifact('subject')]);
            expect(revised.history.at(-1)).toMatchObject({ kind: 'revised', feedback: 'Reprendre le paragraphe 2', channel: 'link', actorId: OWNER });
        } finally { await app.close(); }
    });
});
