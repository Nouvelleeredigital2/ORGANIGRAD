import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CircuitDefinitionSchema, type ArtifactReference } from '@apps2026/contracts';
import { PgCircuitReceipts, type CircuitReceiptProject } from '../src/state/pgCircuitReceipts.js';
import { PgCircuitStore } from '../src/state/pgCircuitStore.js';
import { createOrvionServiceClient, readOrvionMandateFile, type OrvionArtifactKind } from '../src/integrations/orvionServiceClient.js';
import { deliverProductionStep, deliveryIdempotencyKey, uuidV5, type ReceiptedDeliveryDeps } from '../src/orchestration/receiptedDelivery.js';
import { registerCircuitDeliveryRoutes } from '../src/api/circuitDeliveryRoutes.js';
import { startExecution, completeStep, decideStep, type CircuitExecution } from '../src/orchestration/circuits.js';
import { loadEnv } from '../src/config/env.js';
import { buildPgServer } from '../src/api/pgServer.js';

// Consommateur des reçus : recette TEST FICTIF — Atelier Boréal, vraies migrations rejouées sur PGlite.
const ws = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', key = '33333333-3333-4333-8333-333333333333';
const node = '44444444-4444-4444-8444-444444444444', grant = '55555555-5555-4555-8555-555555555555', human = '66666666-6666-4666-8666-666666666666';
const boardId = '77777777-7777-4777-8777-777777777777', dossierId = '88888888-8888-4888-8888-888888888888', mandate = '99999999-9999-4999-8999-999999999999';
const appUrl = 'https://organigrad.example', orvionOrigin = 'https://orvion.example';
const canonicalUrl = `${appUrl}/?v=projects&project=${project}&workspace=${ws}`;
const target = { appId: 'atelier-orvion', workspaceId: 'boreal-fictif', resourceId: boardId };
const secret = 'CONTENU FICTIF. L’atelier Boréal accueille les objets en panne. Venez avec votre objet et demandez un diagnostic.';
const root = new URL('../../supabase/migrations/', import.meta.url);
const migrations = ['20260911150000_circuits.sql', '20260911165000_circuit_attempts.sql', '20260914110000_project_service_delegations.sql', '20260915120000_circuit_execution_receipts.sql']
    .map(name => readFileSync(new URL(name, root), 'utf8'));
const definition = CircuitDefinitionSchema.parse({ name: 'TEST FICTIF — Atelier Boréal', project: { sourceApp: 'organigrad', projectId: project, workspaceId: ws, canonicalUrl }, steps: [
    { id: 'watch', kind: 'watch', assigneeId: node, instructions: 'Veille fictive' },
    { id: 'select', kind: 'selection', assigneeId: human, instructions: 'Choisir', correctionStepId: 'watch' },
    { id: 'write', kind: 'writing', assigneeId: node, instructions: 'Rédiger' },
    { id: 'brief', kind: 'visual_brief', assigneeId: node, instructions: 'Brief' },
    { id: 'image', kind: 'generation', assigneeId: node, instructions: 'Image simulée' },
    { id: 'control', kind: 'control', assigneeId: node, instructions: 'Relire' },
    { id: 'approve', kind: 'approval', assigneeId: human, instructions: 'Valider', correctionStepId: 'write' }] });
// Genres produits par Orvion (migration 20260915100000) ; version:create prend le genre du payload.
const kindOf: Record<string, OrvionArtifactKind> = { 'watch:create': 'watch', 'article:create': 'article', 'brief:create': 'brief', 'visual_prompt:create': 'visual_prompt', 'review:create': 'review', 'image:attach': 'image' };
type Row = { id: string; status: string; mandate_id: string | null; reference: ArtifactReference | null; payload_sha256: string; superseded_by: string | null; run_version: number; step_id: string };

let db: PGlite, sql: Sql, runId: string, store: PgCircuitStore, receipts: PgCircuitReceipts;
let calls: Array<{ headers: Record<string, string>; body: Record<string, unknown> }>;
let mode: 'ok' | 'lost' | 'reject';
let versions: number;
function adapter(connection: Pick<PGlite, 'query'>): Sql {
    const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => (await connection.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values)).rows;
    return Object.assign(tag, { json: JSON.stringify, begin: (fn: (sql: Sql) => unknown) => db.transaction(tx => Promise.resolve(fn(adapter(tx)))) }) as unknown as Sql;
}
const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ headers: init?.headers as Record<string, string>, body });
    if (mode === 'lost') throw new Error('socket hang up');
    if (mode === 'reject') return Response.json({ success: false, error: { code: 'MANDATE_REVOKED', message: 'refus' } }, { status: 403 });
    const payload = body.payload as { dossierId: string };
    // visual_prompt:create : Orvion rend le prompt ET la version du brief créée dans la même commande.
    const brief = body.operation === 'visual_prompt:create' ? { brief: { id: randomUUID(), kind: 'brief', version: ++versions } } : {};
    const subjects = body.operation === 'watch:create' && Array.isArray((body.payload as { subjects?: unknown[] }).subjects)
        ? { subjects: (body.payload as { subjects: unknown[] }).subjects.map((_, index) => ({ id: randomUUID(), kind: 'subject', version: index + 1 })) } : {};
    return Response.json({ success: true, data: { sourceApp: 'atelier-orvion', objectType: 'editorial_version', id: randomUUID(), kind: kindOf[String(body.operation)] ?? (body.payload as { kind?: string }).kind, version: ++versions,
        dossierId: payload.dossierId, boardId: body.boardId, replayed: false, canonicalUrl: `${orvionOrigin}/boards/${body.boardId}/view/editorial`, ...brief, ...subjects } });
});
const orvion = () => createOrvionServiceClient({ baseUrl: orvionOrigin + '/', qualifiedOrigin: orvionOrigin, mandateId: mandate, originHeader: appUrl, fetchImpl: fetchImpl as unknown as typeof fetch });
const posts = () => fetchImpl.mock.calls.length;
const rows = async () => (await db.query<Row>('select id,status,mandate_id,reference,payload_sha256,superseded_by,run_version,step_id from public.circuit_execution_receipts order by reserved_at')).rows;
const current = async () => (await db.query<{ state: CircuitExecution }>('select state from public.circuit_executions where id=$1', [runId])).rows[0]!.state;
async function persist(state: CircuitExecution) { await db.query('update public.circuit_executions set state=$1,version=$2 where id=$3', [JSON.stringify(state), state.version, runId]); }
const artifact = (kind: ArtifactReference['kind']): ArtifactReference => ({ id: `${kind}-1`, kind, version: 1, sourceApp: 'atelier-orvion', canonicalUrl: `${orvionOrigin}/dossiers/${dossierId}/${kind}/1` });
/** Le run est amené à l'étape « write », prête : veille livrée, sujet choisi par l'humain. */
async function readyToWrite() {
    let run = startExecution(runId, definition, 1);
    run = completeStep(run, 'watch', run.version, [artifact('watch'), artifact('subject')]);
    run = decideStep(run, { stepId: 'select', expectedVersion: run.version, choice: 'approve', feedback: '', channel: 'organigrad', selectedArtifact: artifact('subject'), idempotencyKey: randomUUID() }, { id: human, kind: 'human' });
    await persist(run); return run;
}
async function call(command: string, input: unknown, user: string | null, apiKey: string | null) {
    return (await db.query<{ result: Record<string, unknown> }>('select public.project_service_delegation_command($1,$2,$3,$4,$5,$6) as result', [ws, project, user, apiKey, command, JSON.stringify(input)])).rows[0]!.result;
}
function realAuthorize(grantId = grant, apiKeyId = key): ReceiptedDeliveryDeps['authorize'] {
    return async k => {
        const result = await call('check', { grantId, target, action: 'step:execute', runId: k.runId, runVersion: k.runVersion, stepId: k.stepId }, null, apiKeyId);
        return { grantId: String(result.grantId), project: result.project as CircuitReceiptProject };
    };
}
function deps(overrides: Partial<ReceiptedDeliveryDeps> = {}): ReceiptedDeliveryDeps {
    return { receipts, orvion: orvion(), authorize: realAuthorize(), store, workspaceId: ws, ...overrides };
}
type Operation = 'watch:create' | 'article:create' | 'brief:create' | 'visual_prompt:create' | 'review:create' | 'version:create' | 'image:attach';
const deliver = (stepId: string, runVersion: number, operation: Operation, content = secret, extra: Partial<ReceiptedDeliveryDeps> = {}, kind?: OrvionArtifactKind) =>
    deliverProductionStep({ key: { runId, runVersion, stepId }, editorial: { boardId, dossierId }, operation, payload: { content, ...(kind ? { kind } : {}) } }, deps(extra));

beforeEach(async () => {
    calls = []; mode = 'ok'; versions = 0; fetchImpl.mockClear(); runId = randomUUID();
    db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role;
    create table public.workspaces(id uuid primary key);
    create table public.projects(id uuid,workspace_id uuid,archived_at timestamptz,unique(id,workspace_id));
    create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
    create table public.workspace_api_keys(id uuid primary key,workspace_id uuid,name text,key_hash text,scopes text[],expires_at timestamptz,revoked_at timestamptz);
    create table public.hybrid_nodes(id uuid primary key,workspace_id uuid,type text,nom text);
    create table public.bot_profiles(id uuid primary key,workspace_id uuid,enabled boolean);
    insert into public.workspaces values('${ws}');insert into public.projects values('${project}','${ws}',null);
    insert into public.workspace_members values('${ws}','${human}','owner');
    insert into public.workspace_api_keys values('${key}','${ws}','Orvion','secret-hash',array['node:run'],null,null);
    insert into public.hybrid_nodes values('${node}','${ws}','SOFTWARE_MCP','Orvion');`);
    for (const migration of migrations) await db.exec(migration);
    sql = adapter(db); store = new PgCircuitStore(sql, ws); receipts = new PgCircuitReceipts(sql, ws);
    await db.query('insert into public.team_circuits(id,workspace_id,project_id,definition,created_by) values($1,$2,$3,$4,$5)', [runId, ws, project, JSON.stringify(definition), human]);
    const initial = startExecution(runId, definition, 1);
    await db.query('insert into public.circuit_executions(id,workspace_id,circuit_id,idempotency_key,created_by,version,state) values($1,$2,$1,$3,$4,$5,$6)', [runId, ws, randomUUID(), human, initial.version, JSON.stringify(initial)]);
    await call('create', { grantId: grant, apiKeyId: key, nodeId: node, target, actions: ['step:execute'], expiresAt: new Date(Date.now() + 3600000).toISOString() }, human, null);
}, 30000);
afterEach(async () => { await db.close(); });

it('(1) livre l’étape writing en un seul POST : reçu accepté sous le grant, référence sans contenu, état complété', async () => {
    const run = await readyToWrite();
    const result = await deliver('write', run.version, 'article:create');
    expect(posts()).toBe(1);
    expect(calls[0]!.headers).toMatchObject({ Origin: appUrl, 'Content-Type': 'application/json' });
    expect(calls[0]!.body).toMatchObject({ operation: 'article:create', mandateId: mandate, boardId, project: definition.project, payload: { dossierId, content: secret } });
    expect(calls[0]!.body.idempotencyKey).toBe(deliveryIdempotencyKey(ws, { runId, runVersion: run.version, stepId: 'write' }));
    expect(result.reused).toBe(false);
    expect(result.reference).toEqual({ sourceApp: 'atelier-orvion', id: expect.any(String), kind: 'article', version: 1, canonicalUrl: `${orvionOrigin}/boards/${boardId}/view/editorial` });
    expect(Object.keys(result.reference).sort()).toEqual(['canonicalUrl', 'id', 'kind', 'sourceApp', 'version']);
    const [receipt] = await rows();
    expect(receipt).toMatchObject({ status: 'accepted', mandate_id: grant, reference: result.reference, run_version: run.version, step_id: 'write' });
    expect(receipt!.payload_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(await rows())).not.toContain('Boréal');
    const state = await current();
    expect(state.outputs.write).toEqual([result.reference]);
    expect(state.currentStepId).toBe('brief'); expect(state.version).toBe(run.version + 1);
    expect(JSON.stringify(state)).not.toContain(secret);
});

it('(2) le rejeu de la même version réutilise le reçu sans aucun POST supplémentaire', async () => {
    const run = await readyToWrite();
    // Cas réel du rejeu : l'état n'a pas pu être écrit après l'acceptation ; le reçu fait foi.
    const failing = { getRun: (id: string) => store.getRun(id), complete: vi.fn(async (): Promise<never> => { throw new Error('connection reset'); }) };
    await expect(deliver('write', run.version, 'article:create', secret, { store: failing })).rejects.toMatchObject({ code: 'RECEIPT_ACCEPTED_STATE_UNPERSISTED', detail: { receiptId: expect.any(String) } });
    expect((await rows())[0]!.status).toBe('accepted');
    expect((await current()).version).toBe(run.version);
    const replayed = await deliver('write', run.version, 'article:create');
    expect(replayed.reused).toBe(true);
    expect(posts()).toBe(1);
    expect((await current()).outputs.write).toEqual([replayed.reference]);
    expect(await rows()).toHaveLength(1);
    // Rejeu après que l'étape a avancé : la référence est rendue telle quelle, l'état n'est pas retouché.
    const again = await deliver('write', run.version, 'article:create', secret, { authorize: async () => ({ grantId: grant, project: definition.project }) });
    expect(again).toMatchObject({ reused: true, reference: replayed.reference });
    expect((await current()).version).toBe(run.version + 1);
    expect(posts()).toBe(1);
});

it('(3) une réponse perdue laisse un reçu incertain ; le second appel est refusé sans POST', async () => {
    const run = await readyToWrite();
    mode = 'lost';
    await expect(deliver('write', run.version, 'article:create')).rejects.toMatchObject({ code: 'DELIVERY_UNRESOLVED' });
    expect(posts()).toBe(1);
    expect((await rows())[0]).toMatchObject({ status: 'uncertain', reference: null });
    mode = 'ok';
    await expect(deliver('write', run.version, 'article:create')).rejects.toMatchObject({ code: 'DELIVERY_UNRESOLVED' });
    expect(posts()).toBe(1);
    expect((await current()).version).toBe(run.version);
    // Le délai d'attente est une réponse perdue comme une autre.
    const timeout = vi.fn(async (): Promise<Response> => { throw new DOMException('timeout', 'TimeoutError'); });
    const slow = createOrvionServiceClient({ baseUrl: orvionOrigin + '/', qualifiedOrigin: orvionOrigin, mandateId: mandate, originHeader: appUrl, timeoutMs: 5, fetchImpl: timeout as unknown as typeof fetch });
    await expect(slow.command({ operation: 'article:create', project: definition.project, boardId, idempotencyKey: randomUUID(), payload: { dossierId, content: 'x' } })).rejects.toMatchObject({ code: 'DELIVERY_UNCERTAIN' });
});

it('(4) même version, payload différent : PAYLOAD_CONFLICT sans POST', async () => {
    const run = await readyToWrite();
    await deliver('write', run.version, 'article:create');
    await expect(deliver('write', run.version, 'article:create', 'CONTENU FICTIF différent', { authorize: async () => ({ grantId: grant, project: definition.project }) })).rejects.toMatchObject({ code: 'PAYLOAD_CONFLICT' });
    expect(posts()).toBe(1);
    expect(await rows()).toHaveLength(1);
});

it('(5) un refus de délégation ne crée aucun reçu et n’émet aucun POST', async () => {
    const run = await readyToWrite();
    await db.exec("update public.workspace_api_keys set scopes=array['execution:read']");
    await expect(deliver('write', run.version, 'article:create')).rejects.toThrow('KEY_SCOPE_REQUIRED');
    await db.exec("update public.workspace_api_keys set scopes=array['node:run']");
    await call('revoke', { grantId: grant, expectedVersion: 1 }, human, null);
    await expect(deliver('write', run.version, 'article:create')).rejects.toThrow('GRANT_UNAVAILABLE');
    const stub = { authorize: async () => ({ grantId: grant, project: definition.project }) };
    await expect(deliver('write', run.version, 'watch:create', secret, stub)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(deliver('write', run.version, 'version:create', secret, stub, 'review')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(deliver('write', run.version, 'version:create', secret, stub)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    // brief:create produit « brief », que completeStep refuse pour visual_brief : refusé avant tout effet.
    await db.exec("update public.circuit_executions set state=jsonb_set(state,'{currentStepId}','\"brief\"')");
    await expect(deliver('brief', run.version, 'brief:create', secret, stub)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(posts()).toBe(0);
    expect(await rows()).toHaveLength(0);
    expect((await current()).version).toBe(run.version);
});

it('(6) un 403 d’Orvion laisse le reçu réservé, l’état inchangé, et relaie le code', async () => {
    const run = await readyToWrite();
    mode = 'reject';
    await expect(deliver('write', run.version, 'article:create')).rejects.toMatchObject({ code: 'ORVION_REJECTED', detail: { httpStatus: 403, orvionCode: 'MANDATE_REVOKED' } });
    expect(posts()).toBe(1);
    expect((await rows())[0]).toMatchObject({ status: 'reserved', reference: null });
    expect((await current()).version).toBe(run.version);
    // Après correction côté Orvion, la même clé rejoue la réservation puis un POST unique.
    mode = 'ok';
    expect((await deliver('write', run.version, 'article:create')).reused).toBe(false);
    expect(posts()).toBe(2);
    expect(calls[0]!.body.idempotencyKey).toBe(calls[1]!.body.idempotencyKey);
});

it('(7) correction : la référence v1 reste, le contrôle R1 est remplacé par R2, l’historique garde tout', async () => {
    let run = await readyToWrite();
    let pass = 0;
    const produce = async () => {
        run = (await deliver('write', run.version, pass++ ? 'version:create' : 'article:create', secret, {}, pass > 1 ? 'article' : undefined)).run;
        // Le brief visuel exige le genre « visual_prompt » : seule version:create le produit (brief:create rend « brief »).
        run = (await deliver('brief', run.version, 'version:create', 'ILLUSTRATION DE TEST : atelier imaginaire.', {}, 'visual_prompt')).run;
        run = (await deliver('image', run.version, 'image:attach', 'https://engine.example.invalid/files/1')).run;
        return (await deliver('control', run.version, 'review:create'));
    };
    const first = await produce(); run = first.run;
    const articleV1 = run.outputs.write![0]!;
    expect(run.currentStepId).toBe('approve');
    run = decideStep(run, { stepId: 'approve', expectedVersion: run.version, choice: 'revise', channel: 'organigrad', feedback: 'Ajouter une liste de préparation.', idempotencyKey: randomUUID() }, { id: human, kind: 'human' });
    await persist(run);
    expect(run.outputs.write).toBeUndefined(); expect(run.currentStepId).toBe('write');
    const second = await produce(); run = second.run;
    expect(posts()).toBe(8);
    expect(new Set(calls.map(c => c.body.idempotencyKey)).size).toBe(8);
    const all = await rows();
    const r1 = all.find(r => r.id === first.receipt.id)!, r2 = all.find(r => r.id === second.receipt.id)!;
    expect(r1).toMatchObject({ status: 'superseded', superseded_by: r2.id, reference: first.reference });
    expect(r2).toMatchObject({ status: 'accepted', reference: second.reference });
    expect(all.filter(r => r.step_id === 'write').map(r => r.status)).toEqual(['accepted', 'accepted']);
    expect(all.filter(r => r.step_id === 'write')[0]!.reference).toEqual(articleV1);
    expect(run.outputs.write![0]).not.toEqual(articleV1);
    const completed = run.history.filter(h => h.stepId === 'write' && h.kind === 'completed');
    expect(completed.map(h => h.outputs![0])).toEqual([articleV1, run.outputs.write![0]]);
    expect(run.status).toBe('waiting_approval');
    expect(JSON.stringify(run)).not.toContain('CONTENU FICTIF');
});

async function api(logger?: FastifyInstance['log']) {
    const app = Fastify(logger ? { loggerInstance: logger, disableRequestLogging: true } : {});
    const actor = { service: true, grant: true };
    app.addHook('onRequest', async req => { req.workspaceId = ws; if (actor.service) req.apiKeyId = key; else req.userId = human; });
    registerCircuitDeliveryRoutes(app, { sql, appUrl, orvion: orvion(), receiptsFor: id => new PgCircuitReceipts(sql, id), storeFor: id => new PgCircuitStore(sql, id) });
    const body = (runVersion: number, over: Record<string, unknown> = {}) => ({ grantId: actor.grant ? grant : randomUUID(), target, runVersion, operation: 'article:create', editorial: { boardId, dossierId }, payload: { content: secret }, ...over });
    const post = async (stepId: string, payload: Record<string, unknown>) => await app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/steps/${stepId}/deliver`, payload });
    return { app, actor, body, post };
}

it('(8) route : clé de service seulement, grant requis, corps strict, réponse sans contenu', async () => {
    const run = await readyToWrite();
    const { app, actor, body, post } = await api();
    try {
        actor.service = false;
        expect((await post('write', body(run.version))).json()).toEqual({ error: 'SERVICE_KEY_REQUIRED' });
        actor.service = true; actor.grant = false;
        const noGrant = await post('write', body(run.version));
        expect(noGrant.statusCode).toBe(403); expect(noGrant.json()).toEqual({ error: 'GRANT_UNAVAILABLE' });
        actor.grant = true;
        expect((await post('write', body(run.version, { extra: 1 }))).statusCode).toBe(400);
        expect((await post('write', body(run.version, { payload: { content: secret, sources: ['http://insecure.example'] } }))).statusCode).toBe(400);
        expect((await post('write', body(run.version, { operation: 'watch:create' }))).statusCode).toBe(400);
        expect((await post('write', { ...body(run.version), grantId: 'not-a-uuid' })).statusCode).toBe(400);
        expect(posts()).toBe(0); expect(await rows()).toHaveLength(0);
        const stale = await post('write', body(run.version + 1));
        expect(stale.statusCode).toBe(409); expect(stale.json()).toEqual({ error: 'STALE_EXECUTION' });
        const ok = await post('write', body(run.version));
        expect(ok.statusCode).toBe(200); expect(ok.headers['cache-control']).toBe('private, no-store');
        expect(ok.json()).toEqual({ receiptId: expect.any(String), reference: expect.objectContaining({ kind: 'article' }), companions: [], runVersion: run.version + 1, reused: false });
        expect(ok.body).not.toContain(secret); expect(ok.body).not.toContain(mandate);
        const conflict = await post('write', body(run.version, { payload: { content: 'autre' } }));
        expect(conflict.statusCode).toBe(409); expect(conflict.json()).toEqual({ error: 'STALE_EXECUTION' });
        const unknownRun = await app.inject({ method: 'POST', url: `/api/circuit-runs/${randomUUID()}/steps/write/deliver`, payload: body(run.version) });
        expect(unknownRun.statusCode).toBe(403); expect(unknownRun.json()).toEqual({ error: 'RUN_UNAVAILABLE' });
        mode = 'reject';
        await db.query('update public.circuit_executions set state=$1,version=$2 where id=$3', [JSON.stringify(run), run.version, runId]);
        await db.exec('delete from public.circuit_execution_receipts');
        const rejected = await post('write', body(run.version));
        expect(rejected.statusCode).toBe(502); expect(rejected.json()).toEqual({ error: 'ORVION_REJECTED', code: 'MANDATE_REVOKED', receiptId: expect.any(String) });
        mode = 'lost';
        await db.exec('delete from public.circuit_execution_receipts');
        const lost = await post('write', body(run.version));
        expect(lost.statusCode).toBe(409); expect(lost.json()).toMatchObject({ error: 'DELIVERY_UNRESOLVED' });
        expect(posts()).toBe(3);
    } finally { await app.close(); }
});

it('(9) aucun journal ne contient le contenu ni le mandat', async () => {
    const run = await readyToWrite();
    const lines: string[] = [];
    const record = (...args: unknown[]) => { lines.push(args.map(a => { if (typeof a === 'string') return a; try { return JSON.stringify(a); } catch { return String(a); } }).join(' ')); };
    const logger = { level: 'trace', fatal: record, error: record, warn: record, info: record, debug: record, trace: record, silent: record, child: () => logger } as unknown as FastifyInstance['log'];
    const spies = (['log', 'error', 'warn', 'info', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(record));
    const { app, body, post } = await api(logger);
    try {
        expect((await post('write', body(run.version))).statusCode).toBe(200);
        mode = 'lost';
        await db.exec('delete from public.circuit_execution_receipts');
        await db.query('update public.circuit_executions set state=$1,version=$2 where id=$3', [JSON.stringify(run), run.version, runId]);
        expect((await post('write', body(run.version))).statusCode).toBe(409);
        await db.close();
        expect((await post('write', body(run.version))).statusCode).toBe(503);
        const journal = lines.join('\n');
        expect(journal).not.toContain(secret); expect(journal).not.toContain('CONTENU FICTIF'); expect(journal).not.toContain(mandate);
        expect(journal).toContain('Circuit delivery failed');
    } finally { spies.forEach(s => s.mockRestore()); await app.close(); db = new PGlite(); }
});

it('le client Orvion refuse une réponse non vérifiable (enveloppe, board, origine) comme incertaine et n’expose jamais le mandat', async () => {
    const client = orvion();
    const command = () => client.command({ operation: 'article:create', project: definition.project, boardId, idempotencyKey: randomUUID(), payload: { dossierId, content: 'x' } });
    for (const response of [
        { success: true, data: { sourceApp: 'atelier-orvion', objectType: 'editorial_version', id: randomUUID(), kind: 'article', version: 1, dossierId, boardId: randomUUID(), replayed: false, canonicalUrl: `${orvionOrigin}/b` } },
        { success: true, data: { sourceApp: 'atelier-orvion', objectType: 'editorial_version', id: randomUUID(), kind: 'article', version: 1, dossierId, boardId, replayed: false, canonicalUrl: 'https://elsewhere.example/b' } },
        { success: true, data: { sourceApp: 'atelier-orvion', objectType: 'editorial_version', id: randomUUID(), kind: 'article', version: 1, dossierId, boardId, replayed: false, canonicalUrl: `${orvionOrigin}/b`, content: 'fuite' } },
        { success: true, data: { sourceApp: 'other', objectType: 'editorial_version', id: randomUUID(), kind: 'article', version: 1, dossierId, boardId, replayed: false, canonicalUrl: `${orvionOrigin}/b` } },
    ]) {
        fetchImpl.mockImplementationOnce(async () => Response.json(response));
        await expect(command()).rejects.toMatchObject({ code: 'DELIVERY_UNCERTAIN' });
    }
    for (const status of [500, 429, 408]) {
        fetchImpl.mockImplementationOnce(async () => Response.json({ success: false, error: { code: 'X' } }, { status }));
        await expect(command()).rejects.toMatchObject({ code: 'DELIVERY_UNCERTAIN', httpStatus: status });
    }
    fetchImpl.mockImplementationOnce(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(command()).rejects.toMatchObject({ code: 'DELIVERY_UNCERTAIN' });
    fetchImpl.mockImplementationOnce(async () => Response.json({ success: false, error: { code: 'STALE_VERSION' } }, { status: 409 }));
    let caught: unknown;
    try { await command(); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: 'ORVION_REJECTED', httpStatus: 409, orvionCode: 'STALE_VERSION' });
    expect(JSON.stringify(caught) + String(caught) + (caught as Error).stack).not.toContain(mandate);
    expect(() => createOrvionServiceClient({ baseUrl: 'http://orvion.example/', qualifiedOrigin: 'http://orvion.example', mandateId: mandate, originHeader: appUrl })).toThrow('INVALID_CONFIG');
    expect(() => createOrvionServiceClient({ baseUrl: orvionOrigin + '/api', qualifiedOrigin: orvionOrigin, mandateId: mandate, originHeader: appUrl })).toThrow('INVALID_CONFIG');
    expect(() => createOrvionServiceClient({ baseUrl: orvionOrigin + '/', qualifiedOrigin: orvionOrigin, mandateId: 'nope', originHeader: appUrl })).toThrow('INVALID_CONFIG');
    expect(() => createOrvionServiceClient({ baseUrl: orvionOrigin + '/', qualifiedOrigin: orvionOrigin, mandateId: mandate, originHeader: 'http://organigrad.example' })).toThrow('INVALID_CONFIG');
});

it('la clé d’idempotence est un UUID v5 déterministe, nouvelle à chaque version de run', () => {
    expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    const first = deliveryIdempotencyKey(ws, { runId, runVersion: 3, stepId: 'write' });
    expect(first).toBe(deliveryIdempotencyKey(ws, { runId, runVersion: 3, stepId: 'write' }));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(deliveryIdempotencyKey(ws, { runId, runVersion: 4, stepId: 'write' }));
    expect(first).not.toBe(deliveryIdempotencyKey(randomUUID(), { runId, runVersion: 3, stepId: 'write' }));
});

it('configuration : drapeau fermé par défaut, exigences explicites, mandat lu depuis un fichier sans être journalisé', () => {
    const base = { SUPABASE_DB_URL: 'postgres://test:test@127.0.0.1:5432/test', SUPABASE_JWT_SECRET: 'test-only', PROJECTS_ENABLED: 'true', CIRCUITS_ENABLED: 'true', PROJECT_SERVICE_DELEGATIONS_ENABLED: 'true', APP_URL: appUrl };
    expect(loadEnv(base).circuitDeliveryEnabled).toBe(false);
    expect(() => loadEnv({ ...base, CIRCUIT_DELIVERY_ENABLED: 'true' })).toThrow('ORVION_BASE_URL');
    expect(() => loadEnv({ ...base, PROJECT_SERVICE_DELEGATIONS_ENABLED: 'false', CIRCUIT_DELIVERY_ENABLED: 'true', ORVION_BASE_URL: orvionOrigin + '/', ORVION_QUALIFIED_ORIGIN: orvionOrigin, ORVION_SERVICE_MANDATE_FILE: '/x' })).toThrow('PROJECT_SERVICE_DELEGATIONS_ENABLED');
    expect(() => loadEnv({ ...base, CIRCUIT_DELIVERY_ENABLED: 'true', ORVION_BASE_URL: orvionOrigin + '/', ORVION_QUALIFIED_ORIGIN: 'https://other.example', ORVION_SERVICE_MANDATE_FILE: '/x' })).toThrow('ORVION_QUALIFIED_ORIGIN');
    expect(() => loadEnv({ ...base, CIRCUIT_DELIVERY_ENABLED: 'true', ORVION_BASE_URL: 'http://orvion.example/', ORVION_QUALIFIED_ORIGIN: 'http://orvion.example', ORVION_SERVICE_MANDATE_FILE: '/x' })).toThrow('ORVION_BASE_URL');
    const env = loadEnv({ ...base, CIRCUIT_DELIVERY_ENABLED: 'true', ORVION_BASE_URL: orvionOrigin + '/', ORVION_QUALIFIED_ORIGIN: orvionOrigin, ORVION_SERVICE_MANDATE_FILE: '/run/secrets/mandat' });
    expect(env).toMatchObject({ circuitDeliveryEnabled: true, orvionBaseUrl: orvionOrigin + '/', orvionQualifiedOrigin: orvionOrigin, orvionServiceMandateFile: '/run/secrets/mandat' });
    const dir = mkdtempSync(join(tmpdir(), 'orvion-mandat-'));
    try {
        const file = join(dir, 'mandat');
        writeFileSync(file, `  ${mandate.toUpperCase()}\n`);
        expect(readOrvionMandateFile(file)).toBe(mandate);
        writeFileSync(file, 'pas-un-uuid');
        let caught: unknown;
        try { readOrvionMandateFile(file); } catch (error) { caught = error; }
        expect(String(caught)).toContain('INVALID_CONFIG'); expect(String(caught)).not.toContain('pas-un-uuid');
        expect(() => readOrvionMandateFile(join(dir, 'absent'))).toThrow('INVALID_CONFIG');
    } finally { rmSync(dir, { recursive: true, force: true }); }
    const stub = (() => Promise.resolve([])) as unknown as Sql;
    expect(() => buildPgServer({ sql: stub, circuitDelivery: { orvion: orvion() }, projectsEnabled: true, circuitsEnabled: true, projectServiceDelegationsEnabled: false, notifierOptions: { appUrl } })).toThrow('CIRCUIT_DELIVERY_CONFIG_INCOMPLETE');
    expect(() => buildPgServer({ sql: stub, circuitDelivery: { orvion: orvion() }, projectsEnabled: true, circuitsEnabled: true, projectServiceDelegationsEnabled: true, notifierOptions: { appUrl: 'http://organigrad.example' } })).toThrow('CIRCUIT_DELIVERY_CONFIG_INCOMPLETE');
});

it('(10) visual_prompt:create livre DEUX références distinctes (prompt requis + brief d’accompagnement) en un seul POST, sans jamais substituer l’un à l’autre', async () => {
    let run = await readyToWrite();
    run = (await deliver('write', run.version, 'article:create')).run;
    expect(run.currentStepId).toBe('brief');
    // Le brief est obligatoire avec cette opération, interdit avec les autres ; brief:create seul reste refusé pour visual_brief.
    const stub = { authorize: async () => ({ grantId: grant, project: definition.project }) };
    await expect(deliver('brief', run.version, 'visual_prompt:create', 'PROMPT DE TEST', stub)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(deliverProductionStep({ key: { runId, runVersion: run.version, stepId: 'brief' }, editorial: { boardId, dossierId }, operation: 'article:create', payload: { content: 'x', brief: { content: 'y' } } }, deps(stub))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(deliver('brief', run.version, 'brief:create', 'BRIEF DE TEST', stub)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(posts()).toBe(1);
    const result = await deliverProductionStep({ key: { runId, runVersion: run.version, stepId: 'brief' }, editorial: { boardId, dossierId }, operation: 'visual_prompt:create',
        payload: { content: 'ILLUSTRATION DE TEST : atelier imaginaire.', brief: { content: 'BRIEF DE TEST : ton chaleureux, palette boréale.', sources: ['https://source.example/charte'] } } }, deps());
    expect(posts()).toBe(2);
    expect(calls[1]!.body).toMatchObject({ operation: 'visual_prompt:create', payload: { dossierId, content: 'ILLUSTRATION DE TEST : atelier imaginaire.', brief: { content: 'BRIEF DE TEST : ton chaleureux, palette boréale.', sources: ['https://source.example/charte'] } } });
    expect(result.reference.kind).toBe('visual_prompt');
    expect(result.companions).toEqual([{ sourceApp: 'atelier-orvion', id: expect.any(String), kind: 'brief', version: expect.any(Number), canonicalUrl: result.reference.canonicalUrl }]);
    expect(result.run.currentStepId).toBe('image');
    expect(result.run.outputs.brief).toEqual([result.reference, result.companions[0]]);
    // Le reçu durable ne porte que la référence principale ; rien du contenu.
    const receipt = (await rows()).find(r => r.step_id === 'brief')!;
    expect(receipt).toMatchObject({ status: 'accepted', reference: result.reference });
    expect(JSON.stringify(await rows()) + JSON.stringify(result.run)).not.toContain('DE TEST');
});

it('(11) watch:create avec sujets livre la veille ET ses sujets sourcés en un seul POST ; la sélection humaine choisit alors un sujet réellement présent', async () => {
    const stub = { authorize: async () => ({ grantId: grant, project: definition.project }) };
    await expect(deliverProductionStep({ key: { runId, runVersion: 1, stepId: 'watch' }, editorial: { boardId, dossierId }, operation: 'article:create', payload: { content: 'x', subjects: [{ content: 'y' }] } }, deps(stub))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(deliverProductionStep({ key: { runId, runVersion: 1, stepId: 'watch' }, editorial: { boardId, dossierId }, operation: 'watch:create', payload: { content: 'x', subjects: [] } }, deps(stub))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(posts()).toBe(0);
    const result = await deliverProductionStep({ key: { runId, runVersion: 1, stepId: 'watch' }, editorial: { boardId, dossierId }, operation: 'watch:create',
        payload: { content: 'VEILLE DE TEST : trois pistes.', sources: ['https://source.example/a'], subjects: [{ content: 'SUJET 1', sources: ['https://source.example/a'] }, { content: 'SUJET 2' }] } }, deps());
    expect(posts()).toBe(1);
    expect(result.reference.kind).toBe('watch');
    expect(result.companions.map(c => c.kind)).toEqual(['subject', 'subject']);
    expect(result.run.outputs.watch).toEqual([result.reference, ...result.companions]);
    expect(result.run.currentStepId).toBe('select'); expect(result.run.status).toBe('waiting_approval');
    const chosen = decideStep(result.run, { stepId: 'select', expectedVersion: result.run.version, choice: 'approve', feedback: '', channel: 'link', selectedArtifact: result.companions[1]!, idempotencyKey: randomUUID() }, { id: human, kind: 'human' });
    expect(chosen.outputs.select).toEqual([result.companions[1]]);
    expect(() => decideStep(result.run, { stepId: 'select', expectedVersion: result.run.version, choice: 'approve', feedback: '', channel: 'link', selectedArtifact: { ...result.companions[1]!, id: 'subject-inconnu' }, idempotencyKey: randomUUID() }, { id: human, kind: 'human' })).toThrow('SUBJECT_NOT_IN_DOSSIER');
    expect(JSON.stringify(await rows()) + JSON.stringify(result.run)).not.toContain('DE TEST');
});

