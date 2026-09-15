/**
 * Recette locale intégrée — TEST FICTIF — Atelier Boréal.
 *
 * Serveur OrganiGrad réel (`buildPgServer`) sur PGlite avec les vraies migrations ; Atelier
 * Orvion, ned-media-engine et le hub Synapse sont SIMULÉS derrière les vrais clients et le
 * vrai contrat de fil (assertion d'acteur EdDSA que LINK obtiendrait de `resolve`). Aucun
 * appel réseau, aucune base distante, aucune publication.
 *
 * Parcours : veille sourcée → choix humain (LINK) → article → brief + prompt graphique →
 * Engine → contrôle du Gardien → validation humaine. Même ProjectRef partout ; le bus ne voit
 * que des références.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CircuitDefinitionSchema, type ArtifactReference } from '@apps2026/contracts';
import { createOrvionServiceClient } from '../src/integrations/orvionServiceClient.js';
import { createEngineTaskClient, type EngineArtifactReference, type EngineJobStatus } from '../src/integrations/engineTaskClient.js';
import type { LinkBridgeConfig } from '../src/api/linkBridgeRoutes.js';
import type { CircuitExecution } from '../src/orchestration/circuits.js';

const WS = '11111111-1111-4111-8111-111111111111', PROJECT = '22222222-2222-4222-8222-222222222222';
const OWNER = '33333333-3333-4333-8333-333333333333', STRANGER = '55555555-5555-4555-8555-555555555555';
const ERIC = '61616161-6161-4616-8616-616161616161', DESIGN = '62626262-6262-4626-8626-626262626262', ENGINE = '63636363-6363-4636-8636-636363636363', GUARDIAN = '64646464-6464-4646-8646-646464646464';
const KEYS = { eric: 'ok_eric', design: 'ok_design', engine: 'ok_engine', guardian: 'ok_guardian' } as const;
const KEY_IDS = { eric: '71717171-7171-4717-8717-717171717171', design: '72727272-7272-4727-8727-727272727272', engine: '73737373-7373-4737-8737-737373737373', guardian: '74747474-7474-4747-8747-747474747474' } as const;
const GRANTS = { eric: '81818181-8181-4818-8818-818181818181', design: '82828282-8282-4828-8828-828282828282', engine: '83838383-8383-4838-8838-838383838383', guardian: '84848484-8484-4848-8848-848484848484' } as const;
const NODES = { eric: ERIC, design: DESIGN, engine: ENGINE, guardian: GUARDIAN } as const;
const CIRCUIT = '91919191-9191-4919-8919-919191919191';
const boardId = '77777777-7777-4777-8777-777777777777', dossierId = '88888888-8888-4888-8888-888888888888', mandate = '99999999-9999-4999-8999-999999999999';
const APP_URL = 'https://organigrad.example', ORVION = 'https://orvion.example', ENGINE_ORIGIN = 'https://engine.example', HUB_URL = 'https://hub.example', JWT_SECRET = 'jwt-secret-boreal';
const CANONICAL = `${APP_URL}/?v=projects&project=${PROJECT}&workspace=${WS}`;
const target = (bot: keyof typeof NODES) => ({ appId: bot === 'engine' ? 'ned-media-engine' : 'atelier-orvion', workspaceId: 'boreal-fictif', resourceId: bot === 'engine' ? 'flux-main' : boardId });
const root = new URL('../../supabase/migrations/', import.meta.url);
const migrations = ['20260911150000_circuits.sql', '20260911165000_circuit_attempts.sql', '20260914110000_project_service_delegations.sql', '20260915120000_circuit_execution_receipts.sql'].map((name) => readFileSync(new URL(name, root), 'utf8'));
const definition = CircuitDefinitionSchema.parse({ name: 'TEST FICTIF — Atelier Boréal — recette connectée', project: { sourceApp: 'organigrad', projectId: PROJECT, workspaceId: WS, canonicalUrl: CANONICAL }, steps: [
    { id: 'veille', kind: 'watch', assigneeId: ERIC, validatorKind: 'bot', instructions: 'Produire une veille sourcée.' },
    { id: 'selection', kind: 'selection', assigneeId: OWNER, validatorKind: 'human', correctionStepId: 'veille', instructions: 'Choisir un sujet dans LINK.' },
    { id: 'redaction', kind: 'writing', assigneeId: ERIC, validatorKind: 'bot', instructions: 'Rédiger à partir du sujet choisi.' },
    { id: 'brief_visuel', kind: 'visual_brief', assigneeId: DESIGN, validatorKind: 'bot', instructions: 'Brief et prompt graphique.' },
    { id: 'generation', kind: 'generation', assigneeId: ENGINE, validatorKind: 'bot', instructions: 'Soumettre le prompt à Engine.' },
    { id: 'controle', kind: 'control', assigneeId: GUARDIAN, validatorKind: 'bot', instructions: 'Contrôler sans valider.' },
    { id: 'validation', kind: 'approval', assigneeId: OWNER, validatorKind: 'human', correctionStepId: 'redaction', instructions: 'Valider le dossier final.' }] });
const CONTENT = { watch: 'VEILLE FICTIVE : trois pistes.', subject1: 'SUJET FICTIF 1 : réparer plutôt que jeter.', subject2: 'SUJET FICTIF 2 : la lumière boréale.', article: 'ARTICLE FICTIF v1.', article2: 'ARTICLE FICTIF v2 corrigé.', brief: 'BRIEF FICTIF : ton chaleureux.', prompt: 'PROMPT FICTIF : atelier imaginaire, lumière boréale.', review: 'RAPPORT DU GARDIEN : conforme, contrôle seulement.' };

// ── Hub Synapse simulé : clé Ed25519 épinglée, assertion d'acteur par appel (ce que LINK obtient de `resolve`).
const hub = generateKeyPairSync('ed25519'), orga = generateKeyPairSync('ed25519');
const pem = (k: import('node:crypto').KeyObject, kind: 'public' | 'private') => kind === 'public' ? (k.export({ type: 'spki', format: 'pem' }) as string) : (k.export({ type: 'pkcs8', format: 'pem' }) as string);
const linkBridge: LinkBridgeConfig = { hubPublicKeys: { 'hub-2026': pem(hub.publicKey, 'public') }, signingKid: 'organigrad-2026', signingPrivateKeyPem: pem(orga.privateKey, 'private'), hubUrl: HUB_URL };
let now = 1_800_000_000;
const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
function actorFor(organigradUserId: string): string {
    const h = b64(JSON.stringify({ alg: 'EdDSA', typ: 'synapse-identity-actor+jwt', kid: 'hub-2026' }));
    const p = b64(JSON.stringify({ version: '1.0', issuerApp: 'synapse-hub', audienceApp: 'organigrad', linkId: randomUUID(), linkUserId: randomUUID(), organigradUserId, project: { sourceApp: 'organigrad', workspaceId: WS, projectId: PROJECT, canonicalUrl: CANONICAL }, requestId: randomUUID(), issuedAt: now, expiresAt: now + 60 }));
    return `${h}.${p}.${b64(sign(null, Buffer.from(`${h}.${p}`), hub.privateKey))}`;
}
function sessionJwt(sub: string): string {
    const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }));
    return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}

// ── Orvion et Engine simulés derrière les VRAIS clients (origine qualifiée, un seul POST, corps strict).
let orvionPosts: Array<Record<string, unknown>>, orvionVersions: number, orvionMode: 'ok' | 'lost';
let jobs: Map<string, { status: EngineJobStatus; results: EngineArtifactReference[] }>, engineStatus: 'available' | 'unavailable', engineSubmissions: number;
const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === ORVION) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        orvionPosts.push(body);
        if (orvionMode === 'lost') throw new Error('socket hang up');
        const payload = body.payload as { dossierId: string; kind?: string; brief?: unknown; subjects?: unknown[] };
        const kind = ({ 'watch:create': 'watch', 'article:create': 'article', 'brief:create': 'brief', 'visual_prompt:create': 'visual_prompt', 'review:create': 'review', 'image:attach': 'image' } as Record<string, string>)[String(body.operation)] ?? payload.kind;
        const extra = body.operation === 'visual_prompt:create' ? { brief: { id: randomUUID(), kind: 'brief', version: ++orvionVersions } }
            : body.operation === 'watch:create' && Array.isArray(payload.subjects) ? { subjects: payload.subjects.map(() => ({ id: randomUUID(), kind: 'subject', version: ++orvionVersions })) } : {};
        return Response.json({ success: true, data: { sourceApp: 'atelier-orvion', objectType: 'editorial_version', id: randomUUID(), kind, version: ++orvionVersions, dossierId: payload.dossierId, boardId: body.boardId, replayed: false, canonicalUrl: `${ORVION}/boards/${body.boardId}/view/editorial`, ...extra } });
    }
    if (url.pathname === '/api/v1/engines') return Response.json({ engines: [{ id: 'flux-main', status: engineStatus, tasks: ['generate-image'], enabled: true }] });
    if (url.pathname === '/api/v1/jobs' && init?.method === 'POST') { engineSubmissions++; const jobId = randomUUID(); jobs.set(jobId, { status: 'queued', results: [] }); return Response.json({ jobId, status: 'queued', pipeline: ['flux-main'] }); }
    const match = /^\/api\/v1\/jobs\/([^/]+)\/results$/.exec(url.pathname);
    if (match) { const job = jobs.get(match[1]!); return job ? Response.json({ jobId: match[1], status: job.status, results: job.results }) : new Response('', { status: 404 }); }
    return new Response('', { status: 404 });
});

let db: PGlite, sql: Sql;
function adapter(client: { query: (s: string, v?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql {
    const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => (await client.query(strings.reduce((s, p, i) => s + (i ? `$${i}` : '') + p, ''), values)).rows;
    return Object.assign(fn, { json: JSON.stringify, array: (v: unknown) => v, begin: (cb: (sql: Sql) => unknown) => db.transaction((tx) => Promise.resolve(cb(adapter(tx)))) }) as unknown as Sql;
}
async function server(): Promise<FastifyInstance> {
    const { buildPgServer } = await import('../src/api/pgServer.js');
    const app = buildPgServer({
        sql, jwtSecret: JWT_SECRET, projectsEnabled: true, circuitsEnabled: true, projectServiceDelegationsEnabled: true,
        circuitDelivery: {
            orvion: createOrvionServiceClient({ baseUrl: ORVION + '/', qualifiedOrigin: ORVION, mandateId: mandate, originHeader: APP_URL, fetchImpl: fetchImpl as unknown as typeof fetch }),
            engine: { client: createEngineTaskClient({ baseUrl: ENGINE_ORIGIN + '/', qualifiedOrigin: ENGINE_ORIGIN, apiKey: 'engine-key-fictive', fetchImpl: fetchImpl as unknown as typeof fetch }), engineId: 'flux-main' },
        },
        linkBridge, linkBridgeNow: () => now, notifierOptions: { appUrl: APP_URL },
    });
    await app.ready(); return app;
}
const state = async (runId: string) => (await db.query<{ state: CircuitExecution }>('select state from public.circuit_executions where id=$1', [runId])).rows[0]!.state;
const receipts = async () => (await db.query<{ step_id: string; status: string; run_version: number; reference: ArtifactReference | null }>('select step_id,status,run_version,reference from public.circuit_execution_receipts order by reserved_at')).rows;
const attempts = async () => (await db.query<{ step_id: string; status: string; run_version: number; job_id: string | null }>('select step_id,status,run_version,job_id from public.circuit_step_attempts order by run_version')).rows;

beforeEach(async () => {
    now = 1_800_000_000; orvionPosts = []; orvionVersions = 0; orvionMode = 'ok'; jobs = new Map(); engineStatus = 'available'; engineSubmissions = 0; fetchImpl.mockClear();
    db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role;
        create table public.workspaces(id uuid primary key);
        create table public.projects(id uuid primary key,workspace_id uuid not null references workspaces(id),archived_at timestamptz,unique(id,workspace_id));
        create function public.is_workspace_member(uuid) returns boolean language sql as $$select true$$;
        create table workspace_members(workspace_id uuid, user_id uuid, role text, primary key(workspace_id,user_id));
        create table workspace_api_keys(id uuid primary key, workspace_id uuid, name text, key_hash text, scopes text[], expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz);
        create table hybrid_nodes(id uuid primary key, workspace_id uuid, type text, nom text, status text default 'IDLE');
        create table public.bot_profiles(id uuid primary key,workspace_id uuid,enabled boolean);
        create table audit_log(id bigint generated always as identity, workspace_id text, actor_kind text, actor_id text, action text, resource_type text, resource_id text, result text, metadata jsonb, ip text, request_id text, created_at timestamptz default now());
        insert into workspaces values ('${WS}'); insert into projects values ('${PROJECT}','${WS}',null);
        insert into workspace_members values ('${WS}','${OWNER}','owner');
        insert into hybrid_nodes(id,workspace_id,type,nom) values ('${ERIC}','${WS}','AGENT_IA','Eric'),('${DESIGN}','${WS}','AGENT_IA','Design'),('${ENGINE}','${WS}','SOFTWARE_MCP','Engine'),('${GUARDIAN}','${WS}','AGENT_IA','Gardien');`);
    for (const [bot, key] of Object.entries(KEYS) as Array<[keyof typeof KEYS, string]>) {
        await db.query('insert into workspace_api_keys(id,workspace_id,name,key_hash,scopes) values($1,$2,$3,$4,$5)', [KEY_IDS[bot], WS, bot, createHash('sha256').update(key).digest('hex'), ['node:run', 'graph:read', 'node:read', 'execution:read']]);
    }
    for (const migration of migrations) await db.exec(migration);
    sql = adapter(db);
    await db.query('insert into public.team_circuits(id,workspace_id,project_id,definition,created_by) values($1,$2,$3,$4,$5)', [CIRCUIT, WS, PROJECT, JSON.stringify(definition), OWNER]);
    // Une délégation step:execute par bot, bornée à son nœud : la clé du Gardien ne livre jamais une autre étape.
    for (const bot of Object.keys(NODES) as Array<keyof typeof NODES>) {
        await db.query('select public.project_service_delegation_command($1,$2,$3,$4,$5,$6)', [WS, PROJECT, OWNER, null, 'create', JSON.stringify({ grantId: GRANTS[bot], apiKeyId: KEY_IDS[bot], nodeId: NODES[bot], target: target(bot), actions: ['step:execute'], expiresAt: new Date(Date.now() + 3600000).toISOString() })]);
    }
}, 30000);
afterEach(async () => { await db.close(); });

type App = FastifyInstance;
const asHuman = (user = OWNER) => ({ authorization: `Bearer ${sessionJwt(user)}`, 'x-workspace-id': WS });
const asBot = (bot: keyof typeof KEYS) => ({ authorization: `Bearer ${KEYS[bot]}` });
const linkDecide = (app: App, runId: string, organigradUserId: string, body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/link-bridge/circuit-runs/${runId}/decisions`, payload: body, headers: { 'x-synapse-actor': actorFor(organigradUserId) } });
const linkList = (app: App, organigradUserId: string) => app.inject({ method: 'GET', url: '/api/link-bridge/circuit-runs', headers: { 'x-synapse-actor': actorFor(organigradUserId) } });
const deliver = (app: App, bot: keyof typeof KEYS, runId: string, stepId: string, runVersion: number, operation: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/steps/${stepId}/deliver`, headers: asBot(bot), payload: { grantId: GRANTS[bot], target: target(bot), runVersion, operation, editorial: { boardId, dossierId }, payload } });
const generate = (app: App, runId: string, runVersion: number, prompt = CONTENT.prompt) => app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/steps/generation/generate`, headers: asBot('engine'), payload: { grantId: GRANTS.engine, target: target('engine'), runVersion, prompt } });
const settle = (app: App, runId: string, runVersion: number) => app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/steps/generation/generation-result`, headers: asBot('engine'), payload: { grantId: GRANTS.engine, target: target('engine'), runVersion } });
const control = (app: App, runId: string, action: string, expectedVersion: number) => app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/control`, headers: asHuman(), payload: { action, expectedVersion, idempotencyKey: randomUUID() } });
const run = (res: { json: () => unknown }) => (res.json() as { run: CircuitExecution }).run;

it('parcourt le dossier fictif de bout en bout : un seul dossier, une seule tâche Engine, des références seulement, et toutes les portes fermées où elles doivent l’être', async () => {
    let app = await server();
    try {
        // ── 1. Double lancement : la même clé d'idempotence rend le même dossier, jamais deux.
        const launchKey = randomUUID();
        const started = await app.inject({ method: 'POST', url: `/api/circuits/${CIRCUIT}/runs`, headers: asHuman(), payload: { idempotencyKey: launchKey } });
        expect(started.statusCode).toBe(201);
        const runId = run(started).id;
        const again = await app.inject({ method: 'POST', url: `/api/circuits/${CIRCUIT}/runs`, headers: asHuman(), payload: { idempotencyKey: launchKey } });
        expect(run(again).id).toBe(runId);
        expect((await db.query('select count(*)::int as n from public.circuit_executions')).rows[0]).toEqual({ n: 1 });
        // Une clé technique ne lance pas un dossier (session humaine exigée).
        expect((await app.inject({ method: 'POST', url: `/api/circuits/${CIRCUIT}/runs`, headers: asBot('eric'), payload: { idempotencyKey: randomUUID() } })).statusCode).toBe(401);

        // ── 2. Non-membre : invisible et refusé par LINK, même avec une assertion valide du hub.
        expect((await linkList(app, STRANGER)).statusCode).toBe(403);
        expect((await linkDecide(app, runId, STRANGER, { stepId: 'veille', choice: 'approve', expectedVersion: 1, idempotencyKey: randomUUID() })).json()).toEqual({ error: 'FORBIDDEN' });

        // ── 3. Veille sourcée par Eric : un POST Orvion, veille + deux sujets ; rejeu sans second POST ; le Gardien ne livre pas cette étape.
        expect((await deliver(app, 'guardian', runId, 'veille', 1, 'watch:create', { content: CONTENT.watch })).json()).toEqual({ error: 'STEP_FORBIDDEN' });
        const watch = await deliver(app, 'eric', runId, 'veille', 1, 'watch:create', { content: CONTENT.watch, sources: ['https://source.example.invalid/a'], subjects: [{ content: CONTENT.subject1, sources: ['https://source.example.invalid/a'] }, { content: CONTENT.subject2 }] });
        expect(watch.statusCode).toBe(200);
        expect(watch.json()).toMatchObject({ reused: false, runVersion: 2, reference: { kind: 'watch' }, companions: [{ kind: 'subject' }, { kind: 'subject' }] });
        expect(orvionPosts).toHaveLength(1);
        expect((await deliver(app, 'eric', runId, 'veille', 1, 'watch:create', { content: CONTENT.watch, sources: ['https://source.example.invalid/a'], subjects: [{ content: CONTENT.subject1, sources: ['https://source.example.invalid/a'] }, { content: CONTENT.subject2 }] })).json()).toEqual({ error: 'STALE_EXECUTION' });
        expect(orvionPosts).toHaveLength(1);
        let current = await state(runId);
        expect(current).toMatchObject({ status: 'waiting_approval', currentStepId: 'selection', version: 2 });
        const subjects = current.outputs.veille!.filter((r) => r.kind === 'subject');
        expect(subjects).toHaveLength(2);

        // ── 4. LINK : liste les dossiers du projet ; double clic et concurrence sur le choix du sujet.
        const listed = await linkList(app, OWNER);
        expect(listed.statusCode).toBe(200);
        expect((listed.json() as { runs: CircuitExecution[] }).runs.map((r) => r.id)).toEqual([runId]);
        const choose = { stepId: 'selection', choice: 'approve', expectedVersion: 2, idempotencyKey: randomUUID(), selectedArtifact: subjects[0] };
        const [a, b] = await Promise.all([linkDecide(app, runId, OWNER, choose), linkDecide(app, runId, OWNER, { ...choose, idempotencyKey: randomUUID(), selectedArtifact: subjects[1] })]);
        expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
        // Réponse LINK perdue : LINK relit l'état plutôt que rejouer ; s'il rejoue la même clé, le reçu existant est rendu.
        const replay = await linkDecide(app, runId, OWNER, choose);
        expect(replay.statusCode).toBe(200);
        expect((replay.json() as { replayed: boolean }).replayed).toBe(true);
        current = await state(runId);
        expect(current).toMatchObject({ status: 'ready', currentStepId: 'redaction', version: 3 });
        expect(current.history.filter((h) => h.kind === 'approved')).toHaveLength(1);
        expect(current.outputs.selection!.map((r) => r.id)).toEqual([subjects[0]!.id]);

        // ── 5. Article v1 ; brief + prompt (deux références distinctes) par Design.
        expect((await deliver(app, 'eric', runId, 'redaction', 3, 'article:create', { content: CONTENT.article })).statusCode).toBe(200);
        expect((await deliver(app, 'design', runId, 'brief_visuel', 4, 'brief:create', { content: CONTENT.brief })).statusCode).toBe(400);
        const brief = await deliver(app, 'design', runId, 'brief_visuel', 4, 'visual_prompt:create', { content: CONTENT.prompt, brief: { content: CONTENT.brief } });
        expect(brief.statusCode).toBe(200);
        expect(brief.json()).toMatchObject({ reference: { kind: 'visual_prompt' }, companions: [{ kind: 'brief' }] });
        current = await state(runId);
        expect(current).toMatchObject({ status: 'ready', currentStepId: 'generation', version: 5 });

        // ── 6. Engine indisponible : attente explicite, aucun visuel, aucune tâche ; reprise par l'administrateur.
        engineStatus = 'unavailable';
        const waiting = await generate(app, runId, 5);
        expect(waiting.statusCode).toBe(409);
        expect(waiting.json()).toEqual({ error: 'ENGINE_UNAVAILABLE', status: 'waiting_engine', runVersion: 6 });
        expect(engineSubmissions).toBe(0);
        expect(await attempts()).toHaveLength(0);
        expect((await state(runId)).outputs.brief_visuel!.map((r) => r.kind)).toEqual(['visual_prompt', 'brief']);
        expect((await generate(app, runId, 6)).json()).toMatchObject({ error: 'ENGINE_UNAVAILABLE', status: 'waiting_engine' });
        engineStatus = 'available';
        expect((await app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/control`, headers: asBot('engine'), payload: { action: 'retry_engine', expectedVersion: 6, idempotencyKey: randomUUID() } })).statusCode).toBe(401);
        const resumed = await control(app, runId, 'retry_engine', 6);
        expect(resumed.statusCode).toBe(200);
        expect(run(resumed)).toMatchObject({ status: 'ready', currentStepId: 'generation', version: 7 });

        // ── 7. Soumission unique ; redémarrage du worker : une NOUVELLE instance règle la même tâche.
        const submitted = await generate(app, runId, 7);
        expect(submitted.statusCode).toBe(200);
        const { jobId } = submitted.json() as { jobId: string };
        expect(engineSubmissions).toBe(1);
        expect((await generate(app, runId, 7)).json()).toMatchObject({ jobId, reused: true });
        expect(engineSubmissions).toBe(1);
        await app.close();
        app = await server();
        expect((await settle(app, runId, 7)).statusCode).toBe(202);
        const fileId = randomUUID();
        jobs.set(jobId, { status: 'completed', results: [{ fileId, role: 'output', type: 'image/png', downloadUrl: `/api/v1/files/${fileId}` }] });
        const image = await settle(app, runId, 7);
        expect(image.statusCode).toBe(200);
        expect(image.json()).toMatchObject({ reused: false, runVersion: 8, reference: { sourceApp: 'ned-media-engine', kind: 'image', id: fileId } });
        expect(engineSubmissions).toBe(1);
        expect(await attempts()).toEqual([{ step_id: 'generation', status: 'accepted', run_version: 7, job_id: jobId }]);

        // ── 8. Contrôle du Gardien : un rapport, jamais une validation.
        expect((await deliver(app, 'guardian', runId, 'controle', 8, 'review:create', { content: CONTENT.review })).statusCode).toBe(200);
        current = await state(runId);
        expect(current).toMatchObject({ status: 'waiting_approval', currentStepId: 'validation', version: 9 });
        expect((await linkDecide(app, runId, GUARDIAN, { stepId: 'validation', choice: 'approve', expectedVersion: 9, idempotencyKey: randomUUID() })).json()).toEqual({ error: 'FORBIDDEN' });
        // Une étape humaine n'est jamais « livrable » par un bot : refus (étape non prête / interdite), jamais un effet.
        const guardianOnHuman = await deliver(app, 'guardian', runId, 'validation', 9, 'review:create', { content: 'x' });
        expect([403, 409]).toContain(guardianOnHuman.statusCode);
        expect(['STEP_FORBIDDEN', 'STEP_NOT_READY']).toContain((guardianOnHuman.json() as { error: string }).error);
        expect((await state(runId)).version).toBe(9);

        // ── 9. Correction humaine depuis LINK : article v2 ; le contrôle v1 est invalidé puis remplacé ; l'ancienne référence reste.
        const revised = await linkDecide(app, runId, OWNER, { stepId: 'validation', choice: 'revise', expectedVersion: 9, idempotencyKey: randomUUID(), feedback: 'Reprendre le paragraphe 2.' });
        expect(revised.statusCode).toBe(200);
        current = run(revised);
        expect(current).toMatchObject({ status: 'ready', currentStepId: 'redaction', version: 10 });
        expect(current.outputs.redaction).toBeUndefined(); expect(current.outputs.controle).toBeUndefined(); expect(current.outputs.generation).toBeUndefined();
        expect(current.outputs.selection).toHaveLength(1);
        const articleV1 = (await receipts()).find((r) => r.step_id === 'redaction')!.reference!;
        expect((await deliver(app, 'eric', runId, 'redaction', 10, 'version:create', { content: CONTENT.article2, kind: 'article', expectedVersion: 1 })).statusCode).toBe(200);
        expect((await deliver(app, 'design', runId, 'brief_visuel', 11, 'visual_prompt:create', { content: CONTENT.prompt, brief: { content: CONTENT.brief, expectedVersion: 1 }, expectedVersion: 1 })).statusCode).toBe(200);
        const second = await generate(app, runId, 12);
        expect(second.statusCode).toBe(200);
        const jobId2 = (second.json() as { jobId: string }).jobId;
        expect(jobId2).not.toBe(jobId); expect(engineSubmissions).toBe(2);
        const fileId2 = randomUUID();
        jobs.set(jobId2, { status: 'completed', results: [{ fileId: fileId2, role: 'output', type: 'image/png', downloadUrl: `/api/v1/files/${fileId2}` }] });
        expect((await settle(app, runId, 12)).statusCode).toBe(200);
        expect((await deliver(app, 'guardian', runId, 'controle', 13, 'review:create', { content: CONTENT.review + ' v2' })).statusCode).toBe(200);
        const all = await receipts();
        expect(all.filter((r) => r.step_id === 'redaction').map((r) => r.status)).toEqual(['accepted', 'accepted']);
        expect(all.filter((r) => r.step_id === 'redaction')[0]!.reference).toEqual(articleV1);
        expect(all.filter((r) => r.step_id === 'controle').map((r) => r.status)).toEqual(['superseded', 'accepted']);
        expect(all.filter((r) => r.step_id === 'generation').map((r) => r.status)).toEqual(['accepted', 'accepted']);

        // ── 10. Validation finale humaine : prêt à publier, jamais publié ; double clic idempotent.
        current = await state(runId);
        expect(current).toMatchObject({ status: 'waiting_approval', currentStepId: 'validation', version: 14 });
        const approve = { stepId: 'validation', choice: 'approve', expectedVersion: 14, idempotencyKey: randomUUID() };
        expect((await linkDecide(app, runId, OWNER, approve)).statusCode).toBe(200);
        expect((await linkDecide(app, runId, OWNER, approve)).json()).toMatchObject({ replayed: true });
        current = await state(runId);
        expect(current.status).toBe('ready_to_publish'); expect(current.version).toBe(15);
        expect(current.outputs.redaction![0]!.version).not.toBe(articleV1.version);

        // ── 11. Invariants : un dossier, deux tâches Engine (une par version corrigée), aucun contenu nulle part, même ProjectRef partout.
        expect((await db.query('select count(*)::int as n from public.circuit_executions')).rows[0]).toEqual({ n: 1 });
        expect(await attempts()).toHaveLength(2);
        expect(orvionPosts).toHaveLength(7);
        expect(new Set(orvionPosts.map((p) => p.idempotencyKey)).size).toBe(7);
        for (const post of orvionPosts) expect(post.project).toEqual(definition.project);
        const persisted = JSON.stringify(current) + JSON.stringify(all) + JSON.stringify(await attempts()) + JSON.stringify((await db.query('select * from audit_log')).rows);
        for (const text of Object.values(CONTENT)) expect(persisted).not.toContain(text);
        expect(persisted).not.toContain(mandate); expect(persisted).not.toContain('engine-key-fictive'); expect(persisted).not.toContain('eyJ');
        expect(current.definition.project).toEqual(definition.project);
        // Aucune route de publication n'existe : le dossier reste chez ses propriétaires.
        expect((await app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/publish`, headers: asHuman(), payload: {} })).statusCode).toBe(404);
    } finally { await app.close(); }
}, 120000);

it('une réponse Orvion perdue laisse le reçu incertain : aucun second POST, le dossier reste en attente d’une résolution humaine', async () => {
    const app = await server();
    try {
        const runId = run(await app.inject({ method: 'POST', url: `/api/circuits/${CIRCUIT}/runs`, headers: asHuman(), payload: { idempotencyKey: randomUUID() } })).id;
        orvionMode = 'lost';
        const lost = await deliver(app, 'eric', runId, 'veille', 1, 'watch:create', { content: CONTENT.watch, subjects: [{ content: CONTENT.subject1 }] });
        expect(lost.statusCode).toBe(409); expect(lost.json()).toMatchObject({ error: 'DELIVERY_UNRESOLVED' });
        orvionMode = 'ok';
        expect((await deliver(app, 'eric', runId, 'veille', 1, 'watch:create', { content: CONTENT.watch, subjects: [{ content: CONTENT.subject1 }] })).json()).toMatchObject({ error: 'DELIVERY_UNRESOLVED' });
        expect(orvionPosts).toHaveLength(1);
        expect((await receipts())[0]).toMatchObject({ step_id: 'veille', status: 'uncertain', reference: null });
        expect((await state(runId)).version).toBe(1);
        expect((await linkList(app, OWNER)).json()).toMatchObject({ runs: [{ id: runId, status: 'ready', currentStepId: 'veille' }] });
    } finally { await app.close(); }
}, 60000);
