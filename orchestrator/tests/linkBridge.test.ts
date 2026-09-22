/**
 * Pont LINK ↔ OrganiGrad (recette « Atelier Boréal ») — serveur Fastify réel
 * (`buildPgServer`) sur PGlite : membres, nœuds, transitions et journal d'audit.
 *
 * L'assertion d'acteur est construite ICI avec `node:crypto` seul (pas via le
 * module vérifié) pour prouver l'interopérabilité du contrat de fil.
 */
import { PGlite } from '@electric-sql/pglite';
import Fastify from 'fastify';
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { Sql } from 'postgres';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { loadLinkBridgeConfig, LinkBridgeConfigError } from '../src/api/linkBridgeConfig.js';
import { verifyOrganigradAttestation, verifyActorAssertion, IdentityAssertionError } from '../src/api/identityAssertions.js';
import { ReplayGuard, registerLinkBridgeRoutes, type LinkBridgeConfig } from '../src/api/linkBridgeRoutes.js';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '99999999-9999-4999-8999-999999999999';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const OWNER = '33333333-3333-4333-8333-333333333333';
const VIEWER = '44444444-4444-4444-8444-444444444444';
const STRANGER = '55555555-5555-4555-8555-555555555555';
const NODE = '66666666-6666-4666-8666-666666666666';
const OTHER_NODE = '77777777-7777-4777-8777-777777777777';
const API_KEY_ID = '88888888-8888-4888-8888-888888888888';
const API_KEY = 'ok_test-link-bridge';
const APP_URL = 'https://organigrad.example';
const HUB_URL = 'https://hub.example';
const JWT_SECRET = 'jwt-secret-link-bridge';
const CANONICAL = `${APP_URL}/?v=projects&project=${PROJECT}&workspace=${WS}`;

const hub = generateKeyPairSync('ed25519');
const hubOther = generateKeyPairSync('ed25519');
const orga = generateKeyPairSync('ed25519');
const pem = (k: import('node:crypto').KeyObject, kind: 'public' | 'private') =>
    kind === 'public' ? (k.export({ type: 'spki', format: 'pem' }) as string) : (k.export({ type: 'pkcs8', format: 'pem' }) as string);
const HUB_KEYS = { 'hub-2026': pem(hub.publicKey, 'public') };
const config: LinkBridgeConfig = {
    hubPublicKeys: HUB_KEYS,
    signingKid: 'organigrad-2026',
    signingPrivateKeyPem: pem(orga.privateKey, 'private'),
    hubUrl: HUB_URL,
};

let now = 1_800_000_000;
const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** JWS compact EdDSA construit sans le module vérifié. */
function jws(header: Record<string, unknown>, claims: Record<string, unknown>, key = hub.privateKey): string {
    const h = b64(JSON.stringify(header));
    const p = b64(JSON.stringify(claims));
    return `${h}.${p}.${b64(sign(null, Buffer.from(`${h}.${p}`), key))}`;
}
function actorClaims(over: Record<string, unknown> = {}) {
    return {
        version: '1.0', issuerApp: 'synapse-hub', audienceApp: 'organigrad',
        linkId: randomUUID(), linkUserId: randomUUID(), organigradUserId: OWNER,
        project: { sourceApp: 'organigrad', workspaceId: WS, projectId: PROJECT, canonicalUrl: CANONICAL },
        requestId: randomUUID(), issuedAt: now, expiresAt: now + 60, ...over,
    };
}
const actor = (over: Record<string, unknown> = {}, header: Record<string, unknown> = {}) =>
    jws({ alg: 'EdDSA', typ: 'synapse-identity-actor+jwt', kid: 'hub-2026', ...header }, actorClaims(over));

function sessionJwt(sub: string): string {
    const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const p = b64(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }));
    return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}

let db: PGlite;
function adapter(client: { query: (s: string, v?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql {
    const fn = async (strings: TemplateStringsArray, ...values: unknown[]) =>
        (await client.query(strings.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
    return Object.assign(fn, {
        json: JSON.stringify,
        array: (v: unknown) => v,
        begin: (cb: (sql: Sql) => unknown) => db.transaction((tx) => Promise.resolve(cb(adapter(tx)))),
    }) as unknown as Sql;
}
async function rows<T>(q: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(q, params)).rows;
}
async function waitFor<T>(read: () => Promise<T[]>, count = 1): Promise<T[]> {
    for (let i = 0; i < 40; i++) {
        const r = await read();
        if (r.length >= count) return r;
        await new Promise((res) => setTimeout(res, 25));
    }
    return read();
}

beforeEach(async () => {
    now = 1_800_000_000;
    db = new PGlite();
    await db.exec(`
        create table workspace_members(workspace_id uuid, user_id uuid, role text, primary key(workspace_id,user_id));
        create table workspace_api_keys(id uuid primary key, workspace_id uuid, key_hash text, scopes text[], expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz);
        create table hybrid_nodes(id uuid primary key, workspace_id uuid, type text, nom text, role_titre text default '', parent_id uuid, grade_id text default '',
            system_prompt text, skills text[] default array[]::text[], mcp_config jsonb, notification_channels jsonb, avatar_url text,
            status text default 'IDLE', presence text, presence_observed_at timestamptz, cadence text, created_at timestamptz default now(), updated_at timestamptz default now());
        create table node_transitions(id bigint generated always as identity, workspace_id uuid, node_id uuid, from_status text, to_status text, payload jsonb, actor_kind text, actor_id text, created_at timestamptz default now());
        create table audit_log(id bigint generated always as identity, workspace_id text, actor_kind text, actor_id text, action text, resource_type text, resource_id text, result text, metadata jsonb, ip text, request_id text, created_at timestamptz default now());
        insert into workspace_members values ('${WS}','${OWNER}','owner'), ('${WS}','${VIEWER}','viewer'), ('${OTHER_WS}','${STRANGER}','owner');
        insert into hybrid_nodes(id,workspace_id,type,nom,status) values ('${NODE}','${WS}','HUMAN','Validation Boréal','WAITING_HUMAN_APPROVAL'), ('${OTHER_NODE}','${OTHER_WS}','HUMAN','Ailleurs','WAITING_HUMAN_APPROVAL');
        insert into workspace_api_keys(id,workspace_id,key_hash,scopes) values ('${API_KEY_ID}','${WS}','${createHash('sha256').update(API_KEY).digest('hex')}',array['graph:read','node:read']);
    `);
}, 30000);
afterEach(async () => { await db.close(); });

async function server(opts: { enabled?: boolean; fetchImpl?: typeof fetch } = {}) {
    const { buildPgServer } = await import('../src/api/pgServer.js');
    const app = buildPgServer({
        sql: adapter(db),
        jwtSecret: JWT_SECRET,
        linkBridge: opts.enabled === false ? undefined : config,
        linkBridgeNow: () => now,
        notifierOptions: { appUrl: APP_URL },
        fetchImpl: opts.fetchImpl,
    });
    await app.ready();
    return app;
}
const decide = (app: import('fastify').FastifyInstance, assertion: string | string[] | undefined, body: Record<string, unknown> = { decision: 'approved' }, nodeId = NODE, extra: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: `/api/link-bridge/nodes/${nodeId}/decision`, payload: body, headers: { ...(assertion !== undefined ? { 'x-synapse-actor': assertion } : {}), ...extra } });

describe('POST /api/link-bridge/nodes/:nodeId/decision', () => {
    it('applies an owner decision relayed by LINK exactly like a human approval, with a link-bridge audit trace', async () => {
        const app = await server();
        try {
            const claims = actorClaims();
            const res = await decide(app, jws({ alg: 'EdDSA', typ: 'synapse-identity-actor+jwt', kid: 'hub-2026' }, claims));
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ ok: true, resumed: false, waitingHumanAt: null });
            expect(res.headers['cache-control']).toContain('no-store');
            expect((await rows<{ status: string }>('select status from hybrid_nodes where id=$1', [NODE]))[0]!.status).toBe('IDLE');
            const transitions = await rows<{ from_status: string; to_status: string; actor_kind: string; actor_id: string }>('select from_status,to_status,actor_kind,actor_id from node_transitions where node_id=$1', [NODE]);
            expect(transitions).toEqual([{ from_status: 'WAITING_HUMAN_APPROVAL', to_status: 'IDLE', actor_kind: 'user', actor_id: OWNER }]);
            const audit = await waitFor(() => rows<{ action: string; actor_kind: string; actor_id: string; result: string; metadata: Record<string, unknown>; workspace_id: string }>("select action,actor_kind,actor_id,result,metadata,workspace_id from audit_log where action='human:approve'"));
            expect(audit).toHaveLength(1);
            expect(audit[0]).toMatchObject({ actor_kind: 'user', actor_id: OWNER, result: 'success', workspace_id: WS });
            expect(audit[0]!.metadata).toEqual({ via: 'link-bridge', linkId: claims.linkId, linkUserId: claims.linkUserId, requestId: claims.requestId, projectId: PROJECT });
            // Une assertion n'est jamais journalisée telle quelle.
            expect(JSON.stringify(audit)).not.toContain('eyJ');
        } finally { await app.close(); }
    });

    it('rejects with the reason as feedback, through the same transition path', async () => {
        const app = await server();
        try {
            const res = await decide(app, actor(), { decision: 'rejected', reason: 'Visuel hors charte' });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ ok: true, resumed: false, waitingHumanAt: null });
            expect((await rows<{ status: string }>('select status from hybrid_nodes where id=$1', [NODE]))[0]!.status).toBe('ERROR');
            const t = await rows<{ payload: { feedback: string }; actor_id: string }>('select payload,actor_id from node_transitions where node_id=$1', [NODE]);
            expect(t).toEqual([{ payload: { feedback: 'Visuel hors charte' }, actor_id: OWNER }]);
            const audit = await waitFor(() => rows<{ metadata: { via: string } }>("select metadata from audit_log where action='human:reject' and result='success'"));
            expect(audit[0]!.metadata.via).toBe('link-bridge');
        } finally { await app.close(); }
    });

    it('is decided by OrganiGrad membership: viewer and non-member are refused (403), even with a valid hub assertion', async () => {
        const app = await server();
        try {
            for (const organigradUserId of [VIEWER, STRANGER]) {
                const res = await decide(app, actor({ organigradUserId }));
                expect(res.statusCode).toBe(403);
                expect(res.json()).toEqual({ error: 'FORBIDDEN' });
            }
            expect((await rows<{ status: string }>('select status from hybrid_nodes where id=$1', [NODE]))[0]!.status).toBe('WAITING_HUMAN_APPROVAL');
            expect(await rows('select 1 from node_transitions')).toHaveLength(0);
        } finally { await app.close(); }
    });

    it('never resolves a node outside the asserted workspace (404)', async () => {
        const app = await server();
        try {
            const res = await decide(app, actor(), { decision: 'approved' }, OTHER_NODE);
            expect(res.statusCode).toBe(404);
            expect(res.json()).toEqual({ error: 'NODE_NOT_FOUND', nodeId: OTHER_NODE });
            expect((await decide(app, actor(), { decision: 'approved' }, randomUUID())).statusCode).toBe(404);
        } finally { await app.close(); }
    });

    it('refuses expired, forged, unknown-kid, wrong-typ, over-long and over-specified assertions (403)', async () => {
        const app = await server();
        try {
            const cases: Array<[string, string]> = [
                ['expired', actor({ issuedAt: now - 120, expiresAt: now - 60 })],
                ['not yet valid', actor({ issuedAt: now + 30, expiresAt: now + 90 })],
                ['lifetime > 60 s', actor({ issuedAt: now, expiresAt: now + 61 })],
                ['unknown kid', actor({}, { kid: 'hub-2025' })],
                ['forged with another key', jws({ alg: 'EdDSA', typ: 'synapse-identity-actor+jwt', kid: 'hub-2026' }, actorClaims(), hubOther.privateKey)],
                ['wrong typ', actor({}, { typ: 'synapse-organigrad-identity+jwt' })],
                ['extra claim', actor({ role: 'owner' })],
                ['wrong audience', actor({ audienceApp: 'link' })],
                ['wrong issuer', actor({ issuerApp: 'link' })],
                ['missing claim', (() => { const c = actorClaims(); delete (c as Record<string, unknown>).linkId; return jws({ alg: 'EdDSA', typ: 'synapse-identity-actor+jwt', kid: 'hub-2026' }, c); })()],
                ['tampered payload', (() => { const [h, , s] = actor().split('.'); return `${h}.${b64(JSON.stringify(actorClaims({ organigradUserId: OWNER })))}.${s}`; })()],
                ['garbage', 'not-a-jws'],
            ];
            for (const [label, assertion] of cases) {
                const res = await decide(app, assertion);
                expect(res.statusCode, label).toBe(403);
                expect(res.json().error, label).toBe('ACTOR_ASSERTION_INVALID');
            }
            expect((await rows<{ status: string }>('select status from hybrid_nodes where id=$1', [NODE]))[0]!.status).toBe('WAITING_HUMAN_APPROVAL');
        } finally { await app.close(); }
    });

    it('rejects a replayed requestId inside the 120 s window (409) before any business check', async () => {
        const app = await server();
        try {
            const claims = actorClaims();
            const first = actor(claims);
            expect((await decide(app, first)).statusCode).toBe(200);
            // Même requestId, assertion re-signée avec un autre nodeId cible : rejeu.
            const replayed = await decide(app, actor({ requestId: claims.requestId }), { decision: 'approved' }, OTHER_NODE);
            expect(replayed.statusCode).toBe(409);
            expect(replayed.json()).toEqual({ error: 'ACTOR_ASSERTION_REPLAYED' });
            now += 121;
            // Fenêtre écoulée : plus un rejeu, mais l'assertion elle-même est expirée.
            expect((await decide(app, first)).statusCode).toBe(403);
        } finally { await app.close(); }
        const guard = new ReplayGuard(1000);
        expect(guard.accept('a', 0)).toBe(true);
        expect(guard.accept('a', 999)).toBe(false);
        expect(guard.accept('a', 1000)).toBe(true);
    });

    it('requires the canonical native project reference (403 UNQUALIFIED_PROJECT_REFERENCE)', async () => {
        const app = await server();
        try {
            for (const canonicalUrl of [
                `https://evil.example/?v=projects&project=${PROJECT}&workspace=${WS}`,
                `${APP_URL}/?v=projects&project=${PROJECT}&workspace=${OTHER_WS}`,
                `http://organigrad.example/?v=projects&project=${PROJECT}&workspace=${WS}`,
                `${CANONICAL}&extra=1`,
            ]) {
                const res = await decide(app, actor({ project: { sourceApp: 'organigrad', workspaceId: WS, projectId: PROJECT, canonicalUrl } }));
                expect(res.statusCode, canonicalUrl).toBe(403);
                expect(res.json()).toEqual({ error: 'UNQUALIFIED_PROJECT_REFERENCE' });
            }
        } finally { await app.close(); }
    });

    it('validates transport strictly: header required and single, no Bearer, strict body, uuid node', async () => {
        const app = await server();
        try {
            expect((await decide(app, undefined)).statusCode).toBe(400);
            expect((await decide(app, [actor(), actor()])).statusCode).toBe(400);
            expect((await decide(app, actor(), { decision: 'approved' }, NODE, { authorization: `Bearer ${API_KEY}` })).json()).toEqual({ error: 'UNEXPECTED_AUTHORIZATION' });
            expect((await decide(app, actor(), { decision: 'maybe' })).statusCode).toBe(400);
            expect((await decide(app, actor(), { decision: 'approved', organigradUserId: OWNER })).statusCode).toBe(400);
            expect((await decide(app, actor(), { decision: 'rejected', reason: 'x'.repeat(2001) })).statusCode).toBe(400);
            expect((await decide(app, actor(), { decision: 'approved' }, 'not-a-uuid')).statusCode).toBe(400);
            expect(await rows('select 1 from node_transitions')).toHaveLength(0);
        } finally { await app.close(); }
    });

    it('answers 404 when the bridge is disabled and leaves the Bearer routes untouched', async () => {
        const app = await server({ enabled: false });
        try {
            const res = await decide(app, actor());
            expect(res.statusCode).toBe(404);
            expect(res.json()).toEqual({ error: 'LINK_BRIDGE_NOT_FOUND' });
            expect((await app.inject({ method: 'POST', url: `/api/nodes/${NODE}/approve` })).statusCode).toBe(401);
            expect((await app.inject({ method: 'POST', url: '/api/identity-links/propose', payload: { linkUserId: randomUUID() } })).statusCode).toBe(401);
            const disabled = await app.inject({ method: 'POST', url: '/api/identity-links/propose', payload: { linkUserId: randomUUID() }, headers: { authorization: `Bearer ${sessionJwt(OWNER)}`, 'x-workspace-id': WS } });
            expect(disabled.statusCode).toBe(404);
        } finally { await app.close(); }
    });

    it('keeps the historical human routes unchanged (session approve/reject, api-key denied)', async () => {
        const app = await server();
        try {
            const denied = await app.inject({ method: 'POST', url: `/api/nodes/${NODE}/approve`, headers: { authorization: `Bearer ${API_KEY}` } });
            expect(denied.statusCode).toBe(403);
            expect(denied.json()).toEqual({ error: 'INSUFFICIENT_SCOPE', required: 'human:approve' });
            const rejected = await app.inject({ method: 'POST', url: `/api/nodes/${NODE}/reject`, payload: { feedback: 'non' }, headers: { authorization: `Bearer ${sessionJwt(OWNER)}`, 'x-workspace-id': WS } });
            expect(rejected.statusCode).toBe(200);
            expect(rejected.json()).toEqual({ ok: true });
            await db.exec(`update hybrid_nodes set status='WAITING_HUMAN_APPROVAL' where id='${NODE}'`);
            const approved = await app.inject({ method: 'POST', url: `/api/nodes/${NODE}/approve`, headers: { authorization: `Bearer ${sessionJwt(OWNER)}`, 'x-workspace-id': WS } });
            expect(approved.statusCode).toBe(200);
            expect(approved.json()).toEqual({ ok: true, resumed: false, waitingHumanAt: null });
            const again = await app.inject({ method: 'POST', url: `/api/nodes/${NODE}/approve`, headers: { authorization: `Bearer ${sessionJwt(OWNER)}`, 'x-workspace-id': WS } });
            expect(again.statusCode).toBe(409);
            expect(again.json().error).toBe('ILLEGAL_TRANSITION');
            const audit = await waitFor(() => rows<{ action: string; result: string; metadata: unknown }>("select action,result,metadata from audit_log where action in ('human:approve','human:reject') order by id"), 4);
            expect(audit.map((a) => [a.action, a.result, a.metadata])).toEqual([
                ['human:approve', 'denied', null], ['human:reject', 'success', null], ['human:approve', 'success', null], ['human:approve', 'error', null],
            ]);
        } finally { await app.close(); }
    });
});

describe('POST /api/identity-links/:action', () => {
    function hubStub(status = 201, body: unknown = { linkId: randomUUID(), status: 'proposed', proposedBy: 'organigrad', createdAt: '2026-09-15T10:00:00Z', confirmedAt: null, revokedAt: null, internal: 'never-forwarded' }) {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(input), init: init ?? {} });
            return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
        }) as unknown as typeof fetch;
        return { fetchImpl, calls };
    }
    const asHuman = (user = OWNER) => ({ authorization: `Bearer ${sessionJwt(user)}`, 'x-workspace-id': WS });

    it('refuses a technical key (403 HUMAN_SESSION_REQUIRED) and never contacts the hub', async () => {
        const { fetchImpl, calls } = hubStub();
        const app = await server({ fetchImpl });
        try {
            const res = await app.inject({ method: 'POST', url: '/api/identity-links/propose', payload: { linkUserId: randomUUID() }, headers: { authorization: `Bearer ${API_KEY}` } });
            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual({ error: 'HUMAN_SESSION_REQUIRED' });
            expect(calls).toHaveLength(0);
        } finally { await app.close(); }
    });

    it('signs a verifiable attestation bound to the session user and relays the hub view', async () => {
        const { fetchImpl, calls } = hubStub();
        const app = await server({ fetchImpl });
        try {
            const linkUserId = randomUUID();
            // Le corps ne peut pas imposer une autre identité : strict → 400.
            expect((await app.inject({ method: 'POST', url: '/api/identity-links/propose', payload: { linkUserId, organigradUserId: STRANGER }, headers: asHuman() })).statusCode).toBe(400);
            expect(calls).toHaveLength(0);
            // Un viewer peut lier SA propre identité.
            const res = await app.inject({ method: 'POST', url: '/api/identity-links/propose', payload: { linkUserId }, headers: asHuman(VIEWER) });
            expect(res.statusCode).toBe(201);
            expect(res.json()).toEqual({ linkId: expect.any(String), status: 'proposed', proposedBy: 'organigrad', createdAt: '2026-09-15T10:00:00Z', confirmedAt: null, revokedAt: null });
            expect(res.headers['cache-control']).toContain('no-store');
            expect(calls).toHaveLength(1);
            expect(calls[0]!.url).toBe(`${HUB_URL}/api/identity-links/propose`);
            expect(calls[0]!.init.method).toBe('POST');
            const sent = JSON.parse(String(calls[0]!.init.body)) as { assertion: string };
            expect(Object.keys(sent)).toEqual(['assertion']);
            const header = JSON.parse(Buffer.from(sent.assertion.split('.')[0]!, 'base64url').toString());
            expect(header).toEqual({ alg: 'EdDSA', typ: 'synapse-organigrad-identity+jwt', kid: 'organigrad-2026' });
            const claims = verifyOrganigradAttestation(sent.assertion, { publicKeys: { 'organigrad-2026': pem(orga.publicKey, 'public') }, now });
            expect(claims).toEqual({ version: '1.0', issuerApp: 'organigrad', audienceApp: 'synapse-hub', purpose: 'identity-link-propose', organigradUserId: VIEWER, workspaceId: WS, linkUserId, requestId: expect.any(String), issuedAt: now, expiresAt: now + 300 });
            expect(() => verifyOrganigradAttestation(sent.assertion, { publicKeys: { 'organigrad-2026': pem(hub.publicKey, 'public') }, now })).toThrow(IdentityAssertionError);
        } finally { await app.close(); }
    });

    it('confirm/revoke carry linkId (+ reason) with a 60 s lifetime; hub errors are propagated with their status', async () => {
        const hubKo = hubStub(409, { error: 'LINK_ALREADY_CONFIRMED', code: 'conflict', detail: 'dropped' });
        const app = await server({ fetchImpl: hubKo.fetchImpl });
        try {
            const linkId = randomUUID();
            const res = await app.inject({ method: 'POST', url: '/api/identity-links/revoke', payload: { linkId, reason: 'Départ' }, headers: asHuman() });
            expect(res.statusCode).toBe(409);
            expect(res.json()).toEqual({ error: 'LINK_ALREADY_CONFIRMED', code: 'conflict' });
            const claims = verifyOrganigradAttestation(JSON.parse(String(hubKo.calls[0]!.init.body)).assertion, { publicKeys: { 'organigrad-2026': pem(orga.publicKey, 'public') }, now });
            expect(claims).toMatchObject({ purpose: 'identity-link-revoke', linkId, reason: 'Départ', organigradUserId: OWNER, expiresAt: now + 60 });
            expect((await app.inject({ method: 'POST', url: '/api/identity-links/revoke', payload: { linkId }, headers: asHuman() })).statusCode).toBe(400);
            expect((await app.inject({ method: 'POST', url: '/api/identity-links/confirm', payload: { linkId, reason: 'x' }, headers: asHuman() })).statusCode).toBe(400);
            expect((await app.inject({ method: 'POST', url: '/api/identity-links/delete', payload: { linkId }, headers: asHuman() })).statusCode).toBe(404);
        } finally { await app.close(); }
    });

    it('fails closed on an unreachable hub (503) or a malformed hub answer (502)', async () => {
        const down = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
        const app = await server({ fetchImpl: down });
        try {
            expect((await app.inject({ method: 'POST', url: '/api/identity-links/confirm', payload: { linkId: randomUUID() }, headers: asHuman() })).json()).toEqual({ error: 'IDENTITY_HUB_UNAVAILABLE' });
        } finally { await app.close(); }
        const bad = hubStub(200, { unexpected: true });
        const app2 = await server({ fetchImpl: bad.fetchImpl });
        try {
            expect((await app2.inject({ method: 'POST', url: '/api/identity-links/confirm', payload: { linkId: randomUUID() }, headers: asHuman() })).statusCode).toBe(502);
        } finally { await app2.close(); }
    });
});

describe('configuration', () => {
    const base = { SUPABASE_DB_URL: 'postgresql://localhost/test', SUPABASE_JWT_SECRET: 'test', APP_URL: APP_URL };
    const full = { ...base, LINK_BRIDGE_ENABLED: '1', LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE: '/run/hub.json', ORGANIGRAD_IDENTITY_SIGNING_KID: 'organigrad-2026', ORGANIGRAD_IDENTITY_SIGNING_PRIVATE_KEY_FILE: '/run/orga.pem', IDENTITY_LINKS_HUB_URL: HUB_URL };

    it('is disabled by default and fails explicitly when enabled without a complete configuration', () => {
        expect(loadEnv(base).linkBridgeEnabled).toBe(false);
        expect(loadLinkBridgeConfig(loadEnv(base))).toBeUndefined();
        expect(() => loadEnv({ ...base, LINK_BRIDGE_ENABLED: '1' })).toThrow(/LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE[\s\S]*ORGANIGRAD_IDENTITY_SIGNING_KID[\s\S]*ORGANIGRAD_IDENTITY_SIGNING_PRIVATE_KEY_FILE[\s\S]*IDENTITY_LINKS_HUB_URL/);
        expect(() => loadEnv({ ...full, IDENTITY_LINKS_HUB_URL: 'http://hub.example' })).toThrow(/IDENTITY_LINKS_HUB_URL/);
        expect(() => loadEnv({ ...full, APP_URL: 'http://organigrad.example' })).toThrow(/APP_URL HTTPS/);
        expect(() => loadEnv({ ...full, LINK_BRIDGE_ENABLED: 'true' })).toThrow(/LINK_BRIDGE_ENABLED/);
        const env = loadEnv(full);
        expect(env).toMatchObject({ linkBridgeEnabled: true, linkBridgeHubPublicKeysFile: '/run/hub.json', organigradIdentitySigningKid: 'organigrad-2026', identityLinksHubUrl: HUB_URL });
    });

    it('reads and validates both key files at startup', () => {
        const env = loadEnv(full);
        const files: Record<string, string> = { '/run/hub.json': JSON.stringify(HUB_KEYS), '/run/orga.pem': pem(orga.privateKey, 'private') };
        const read = (p: string) => { if (!(p in files)) throw new LinkBridgeConfigError(`illisible ${p}`); return files[p]!; };
        const loaded = loadLinkBridgeConfig(env, read);
        expect(loaded).toEqual({ hubPublicKeys: HUB_KEYS, signingKid: 'organigrad-2026', signingPrivateKeyPem: files['/run/orga.pem'], hubUrl: `${HUB_URL}/` });
        expect(() => loadLinkBridgeConfig(env, () => { throw new LinkBridgeConfigError('illisible'); })).toThrow(LinkBridgeConfigError);
        expect(() => loadLinkBridgeConfig(env, (p) => (p === '/run/hub.json' ? '[]' : files[p]!))).toThrow(/objet JSON/);
        expect(() => loadLinkBridgeConfig(env, (p) => (p === '/run/hub.json' ? JSON.stringify({ k: pem(orga.privateKey, 'private') }) : files[p]!))).toThrow(/publiques Ed25519/);
        expect(() => loadLinkBridgeConfig(env, (p) => (p === '/run/orga.pem' ? pem(orga.publicKey, 'public') : files[p]!))).toThrow(/clé privée Ed25519/);
        // Une clé RSA n'est jamais acceptée, même bien formée.
        const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
        expect(() => loadLinkBridgeConfig(env, (p) => (p === '/run/hub.json' ? JSON.stringify({ k: pem(rsa.publicKey, 'public') }) : files[p]!))).toThrow(/publiques Ed25519/);
    });

    it('verifyActorAssertion pins keys by kid and rejects an assertion the moment it expires', () => {
        const a = actor();
        expect(verifyActorAssertion(a, { hubPublicKeys: HUB_KEYS, now }).organigradUserId).toBe(OWNER);
        expect(() => verifyActorAssertion(a, { hubPublicKeys: HUB_KEYS, now: now + 60 })).toThrow(/EXPIRED/);
        expect(() => verifyActorAssertion(a, { hubPublicKeys: { 'hub-2026': pem(hubOther.publicKey, 'public') }, now })).toThrow(/BAD_SIGNATURE/);
        expect(() => verifyActorAssertion(a, { hubPublicKeys: {}, now })).toThrow(/UNKNOWN_KID/);
    });

    it('registers the decision route without any Bearer hook when mounted standalone', async () => {
        const app = Fastify();
        const decideNode = vi.fn(async () => ({ ok: true as const, resumed: false, waitingHumanAt: null }));
        registerLinkBridgeRoutes(app, { sql: adapter(db), config, appUrl: APP_URL, decideNode, now: () => now });
        try {
            const res = await decide(app, actor(), { decision: 'rejected', reason: 'non' });
            expect(res.statusCode).toBe(200);
            expect(decideNode).toHaveBeenCalledTimes(1);
            const [req, , nodeId, decision, reason, meta] = decideNode.mock.calls[0] as unknown as [import('fastify').FastifyRequest, unknown, string, string, string, Record<string, unknown>];
            expect([nodeId, decision, reason]).toEqual([NODE, 'rejected', 'non']);
            expect(req).toMatchObject({ workspaceId: WS, userId: OWNER, apiKeyId: undefined });
            expect(req.scopes).toContain('human:reject');
            expect(meta.via).toBe('link-bridge');
        } finally { await app.close(); }
    });
});
