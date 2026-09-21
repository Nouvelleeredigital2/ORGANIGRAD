import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { Sql } from 'postgres';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CircuitDefinitionSchema, type ArtifactReference } from '@apps2026/contracts';
import { PgCircuitAttempts } from '../src/state/pgCircuitAttempts.js';
import { PgCircuitReceipts, type CircuitReceiptProject } from '../src/state/pgCircuitReceipts.js';
import { PgCircuitStore } from '../src/state/pgCircuitStore.js';
import { createEngineTaskClient, EngineTaskError, type EngineArtifactReference, type EngineJobStatus } from '../src/integrations/engineTaskClient.js';
import { settleGenerationStep, submitGenerationStep, type EngineGenerationDeps } from '../src/orchestration/engineGeneration.js';
import { registerCircuitGenerationRoutes } from '../src/api/circuitGenerationRoutes.js';
import { startExecution, completeStep, decideStep, type CircuitExecution } from '../src/orchestration/circuits.js';

// Étape generation : Engine indisponible → waiting_engine sans image ; tâche acceptée → reçu et référence seulement.
const ws = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222', key = '33333333-3333-4333-8333-333333333333';
const node = '44444444-4444-4444-8444-444444444444', grant = '55555555-5555-4555-8555-555555555555', human = '66666666-6666-4666-8666-666666666666';
const appUrl = 'https://organigrad.example', engineOrigin = 'https://engine.example';
const canonicalUrl = `${appUrl}/?v=projects&project=${project}&workspace=${ws}`;
const target = { appId: 'ned-media-engine', workspaceId: 'boreal-fictif', resourceId: 'flux-main' };
const prompt = 'ILLUSTRATION DE TEST : atelier imaginaire, objets en réparation, lumière boréale.';
const root = new URL('../../supabase/migrations/', import.meta.url);
const migrations = ['20260911150000_circuits.sql', '20260911165000_circuit_attempts.sql', '20260914110000_project_service_delegations.sql', '20260915120000_circuit_execution_receipts.sql'].map((name) => readFileSync(new URL(name, root), 'utf8'));
const definition = CircuitDefinitionSchema.parse({ name: 'TEST FICTIF — Atelier Boréal', project: { sourceApp: 'organigrad', projectId: project, workspaceId: ws, canonicalUrl }, steps: [
    { id: 'watch', kind: 'watch', assigneeId: node, instructions: 'Veille' }, { id: 'select', kind: 'selection', assigneeId: human, instructions: 'Choisir', correctionStepId: 'watch' },
    { id: 'write', kind: 'writing', assigneeId: node, instructions: 'Rédiger' }, { id: 'brief', kind: 'visual_brief', assigneeId: node, instructions: 'Brief' },
    { id: 'image', kind: 'generation', assigneeId: node, instructions: 'Image' }, { id: 'control', kind: 'control', assigneeId: node, instructions: 'Relire' },
    { id: 'approve', kind: 'approval', assigneeId: human, instructions: 'Valider', correctionStepId: 'write' }] });
const artifact = (kind: ArtifactReference['kind']): ArtifactReference => ({ id: `${kind}-1`, kind, version: 1, sourceApp: 'atelier-orvion', canonicalUrl: `https://orvion.example/dossiers/boreal/${kind}/1` });

let db: PGlite, sql: Sql, runId: string, store: PgCircuitStore, attempts: PgCircuitAttempts, receipts: PgCircuitReceipts;
let jobs: Map<string, { status: EngineJobStatus; results: EngineArtifactReference[] }>;
let engineStatus: 'available' | 'unavailable';
let submissions: number;
function adapter(connection: Pick<PGlite, 'query'>): Sql {
    const tag = async (strings: TemplateStringsArray, ...values: unknown[]) => (await connection.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values)).rows;
    return Object.assign(tag, { json: JSON.stringify, begin: (fn: (sql: Sql) => unknown) => db.transaction((tx) => Promise.resolve(fn(adapter(tx)))) }) as unknown as Sql;
}
/** Contrat ned-media-engine /api/v1 simulé derrière le VRAI client (origine qualifiée, préflight, POST unique). */
const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/v1/engines') return Response.json({ engines: [{ id: 'flux-main', status: engineStatus, tasks: ['generate-image'], enabled: true }] });
    if (path === '/api/v1/jobs' && init?.method === 'POST') {
        submissions++;
        const jobId = randomUUID(); jobs.set(jobId, { status: 'queued', results: [] });
        return Response.json({ jobId, status: 'queued', pipeline: ['flux-main'] });
    }
    const match = /^\/api\/v1\/jobs\/([^/]+)\/results$/.exec(path);
    if (match) { const job = jobs.get(match[1]!); return job ? Response.json({ jobId: match[1], status: job.status, results: job.results }) : new Response('', { status: 404 }); }
    return new Response('', { status: 404 });
});
const engine = () => createEngineTaskClient({ baseUrl: engineOrigin + '/', qualifiedOrigin: engineOrigin, apiKey: 'test-key', fetchImpl: fetchImpl as unknown as typeof fetch });
const current = async () => (await db.query<{ state: CircuitExecution }>('select state from public.circuit_executions where id=$1', [runId])).rows[0]!.state;
async function persist(state: CircuitExecution) { await db.query('update public.circuit_executions set state=$1,version=$2 where id=$3', [JSON.stringify(state), state.version, runId]); }
/** Dossier amené à l'étape « image », prête : sujet choisi, article et prompt graphique livrés. */
async function readyForImage() {
    let run = startExecution(runId, definition, 1);
    run = completeStep(run, 'watch', run.version, [artifact('watch'), artifact('subject')]);
    run = decideStep(run, { stepId: 'select', expectedVersion: run.version, choice: 'approve', feedback: '', channel: 'organigrad', selectedArtifact: artifact('subject'), idempotencyKey: randomUUID() }, { id: human, kind: 'human' });
    run = completeStep(run, 'write', run.version, [artifact('article')]);
    run = completeStep(run, 'brief', run.version, [artifact('visual_prompt'), artifact('brief')]);
    await persist(run); return run;
}
async function call(command: string, input: unknown, user: string | null, apiKey: string | null) {
    return (await db.query<{ result: Record<string, unknown> }>('select public.project_service_delegation_command($1,$2,$3,$4,$5,$6) as result', [ws, project, user, apiKey, command, JSON.stringify(input)])).rows[0]!.result;
}
const realAuthorize: EngineGenerationDeps['authorize'] = async (k) => {
    const result = await call('check', { grantId: grant, target, action: 'step:execute', runId: k.runId, runVersion: k.runVersion, stepId: k.stepId }, null, key);
    return { grantId: String(result.grantId), project: result.project as CircuitReceiptProject };
};
const deps = (over: Partial<EngineGenerationDeps> = {}): EngineGenerationDeps => ({ workspaceId: ws, engineId: 'flux-main', attempts, receipts, store, engine: engine(), authorize: realAuthorize, ...over });
const submit = (run: CircuitExecution, text = prompt, over: Partial<EngineGenerationDeps> = {}) => submitGenerationStep({ key: { runId, runVersion: run.version, stepId: 'image' }, prompt: text }, deps(over));
const settle = (run: CircuitExecution, over: Partial<EngineGenerationDeps> = {}) => settleGenerationStep({ key: { runId, runVersion: run.version, stepId: 'image' } }, deps(over));
const receiptRows = async () => (await db.query<{ status: string; reference: ArtifactReference | null; mandate_id: string }>('select status,reference,mandate_id from public.circuit_execution_receipts')).rows;
const attemptRows = async () => (await db.query<{ status: string; job_id: string | null; run_version: number }>('select status,job_id,run_version from public.circuit_step_attempts order by run_version')).rows;

beforeEach(async () => {
    runId = randomUUID(); jobs = new Map(); engineStatus = 'available'; submissions = 0; fetchImpl.mockClear();
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
    insert into public.workspace_api_keys values('${key}','${ws}','Engine','secret-hash',array['node:run'],null,null);
    insert into public.hybrid_nodes values('${node}','${ws}','SOFTWARE_MCP','Engine');`);
    for (const migration of migrations) await db.exec(migration);
    sql = adapter(db); store = new PgCircuitStore(sql, ws); attempts = new PgCircuitAttempts(sql, ws); receipts = new PgCircuitReceipts(sql, ws);
    await db.query('insert into public.team_circuits(id,workspace_id,project_id,definition,created_by) values($1,$2,$3,$4,$5)', [runId, ws, project, JSON.stringify(definition), human]);
    const initial = startExecution(runId, definition, 1);
    await db.query('insert into public.circuit_executions(id,workspace_id,circuit_id,idempotency_key,created_by,version,state) values($1,$2,$1,$3,$4,$5,$6)', [runId, ws, randomUUID(), human, initial.version, JSON.stringify(initial)]);
    await call('create', { grantId: grant, apiKeyId: key, nodeId: node, target, actions: ['step:execute'], expiresAt: new Date(Date.now() + 3600000).toISOString() }, human, null);
}, 30000);
afterEach(async () => { await db.close(); });

it('(1) soumet UNE tâche Engine sous tentative durable, puis complète l’étape avec la seule référence du résultat', async () => {
    const run = await readyForImage();
    const submitted = await submit(run);
    expect(submitted).toMatchObject({ kind: 'submitted', reused: false });
    expect(submissions).toBe(1);
    expect(await attemptRows()).toEqual([{ status: 'accepted', job_id: (submitted as { jobId: string }).jobId, run_version: run.version }]);
    expect((await current()).version).toBe(run.version);
    // Redémarrage / rejeu : même prompt, aucune seconde soumission.
    expect(await submit(run)).toMatchObject({ kind: 'submitted', reused: true });
    expect(submissions).toBe(1);
    await expect(submit(run, 'AUTRE PROMPT')).rejects.toMatchObject({ code: 'PAYLOAD_CONFLICT' });
    // Tâche encore en file : rien ne bouge.
    expect(await settle(run)).toMatchObject({ kind: 'pending', status: 'queued' });
    expect(await receiptRows()).toHaveLength(0);
    const jobId = (submitted as { jobId: string }).jobId;
    const fileId = randomUUID();
    jobs.set(jobId, { status: 'completed', results: [{ fileId, role: 'output', type: 'image/png', downloadUrl: `/api/v1/files/${fileId}` }] });
    const settled = await settle(run);
    expect(settled).toMatchObject({ kind: 'completed', reused: false, reference: { sourceApp: 'ned-media-engine', id: fileId, kind: 'image', version: 1, canonicalUrl: `${engineOrigin}/api/v1/files/${fileId}` } });
    expect(await receiptRows()).toEqual([{ status: 'accepted', reference: (settled as { reference: ArtifactReference }).reference, mandate_id: grant }]);
    const state = await current();
    expect(state.currentStepId).toBe('control'); expect(state.version).toBe(run.version + 1);
    expect(state.outputs.image).toEqual([(settled as { reference: ArtifactReference }).reference]);
    expect(JSON.stringify(state)).not.toContain('ILLUSTRATION DE TEST');
    // Second règlement après avancement : la délégation refuse la version périmée ; sous délégation stub, le reçu fait foi.
    await expect(settle(run)).rejects.toThrow('STALE_EXECUTION');
    expect(await settle(run, { authorize: async () => ({ grantId: grant, project: definition.project }) })).toMatchObject({ kind: 'completed', reused: true });
    expect((await current()).version).toBe(run.version + 1);
    expect(await receiptRows()).toHaveLength(1);
});

it('(2) Engine indisponible : aucune soumission, l’exécution attend explicitement, la reprise humaine conserve la même étape', async () => {
    const run = await readyForImage();
    engineStatus = 'unavailable';
    const waiting = await submit(run);
    expect(waiting.kind).toBe('waiting_engine');
    expect(submissions).toBe(0);
    expect(await attemptRows()).toHaveLength(0);
    let state = await current();
    expect(state).toMatchObject({ status: 'waiting_engine', currentStepId: 'image', version: run.version + 1 });
    expect(state.outputs.image).toBeUndefined();
    expect(state.outputs.brief).toEqual([artifact('visual_prompt'), artifact('brief')]);
    expect(state.history.at(-1)).toMatchObject({ kind: 'waiting_engine', stepId: 'image', version: run.version });
    // Tant que l'attente dure : rien n'est soumis, même si Engine revient.
    engineStatus = 'available';
    expect(await submit(state)).toMatchObject({ kind: 'waiting_engine' });
    expect(submissions).toBe(0);
    await expect(settle(state)).rejects.toThrow('STEP_NOT_READY');
    // Un non-admin ne reprend pas ; l'admin reprend l'étape inchangée, puis la soumission repart.
    await db.exec(`insert into public.workspace_members values('${ws}','${node}','member')`);
    await expect(store.control(runId, { action: 'retry_engine', expectedVersion: state.version, idempotencyKey: randomUUID() }, node)).rejects.toThrow('FORBIDDEN');
    state = await store.control(runId, { action: 'retry_engine', expectedVersion: state.version, idempotencyKey: randomUUID() }, human);
    expect(state).toMatchObject({ status: 'ready', currentStepId: 'image' });
    expect(state.history.at(-1)).toMatchObject({ kind: 'engine_resumed', actorId: human });
    expect(await submit(state)).toMatchObject({ kind: 'submitted', reused: false });
    expect(submissions).toBe(1);
    await expect(store.control(runId, { action: 'retry_engine', expectedVersion: state.version, idempotencyKey: randomUUID() }, human)).rejects.toThrow('ENGINE_NOT_WAITING');
});

it('(3) tâche échouée ou résultat non vérifiable : aucun reçu, aucune image, dossier inchangé', async () => {
    const run = await readyForImage();
    const { jobId } = (await submit(run)) as { jobId: string };
    jobs.set(jobId, { status: 'failed', results: [] });
    await expect(settle(run)).rejects.toMatchObject({ code: 'ENGINE_JOB_FAILED', detail: { jobId } });
    const fileId = randomUUID();
    // Le client refuse un type non image ; l'orchestrateur refuse un résultat vide.
    jobs.set(jobId, { status: 'completed', results: [{ fileId, role: 'output', type: 'application/json', downloadUrl: `/api/v1/files/${fileId}` }] });
    await expect(settle(run)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    jobs.set(jobId, { status: 'completed', results: [] });
    await expect(settle(run)).rejects.toMatchObject({ code: 'ENGINE_RESULT_INVALID' });
    expect(await receiptRows()).toHaveLength(0);
    expect((await current()).version).toBe(run.version);
});

it('(4) refuse hors étape de génération, sans prompt graphique livré, ou sans délégation vivante', async () => {
    let run = startExecution(runId, definition, 1);
    run = completeStep(run, 'watch', run.version, [artifact('watch'), artifact('subject')]);
    await persist(run);
    await expect(submitGenerationStep({ key: { runId, runVersion: run.version, stepId: 'watch' }, prompt }, deps())).rejects.toMatchObject({ code: 'STEP_NOT_GENERATION' });
    run = decideStep(run, { stepId: 'select', expectedVersion: run.version, choice: 'approve', feedback: '', channel: 'organigrad', selectedArtifact: artifact('subject'), idempotencyKey: randomUUID() }, { id: human, kind: 'human' });
    run = completeStep(run, 'write', run.version, [artifact('article')]);
    // Étape image forcée sans prompt graphique : refus explicite.
    await persist({ ...run, currentStepId: 'image' });
    await expect(submit({ ...run, currentStepId: 'image' })).rejects.toMatchObject({ code: 'VISUAL_PROMPT_REQUIRED' });
    run = await readyForImage();
    await call('revoke', { grantId: grant, expectedVersion: 1 }, human, null);
    await expect(submit(run)).rejects.toThrow('GRANT_UNAVAILABLE');
    expect(submissions).toBe(0);
    await expect(submit(run, '', { authorize: async () => ({ grantId: grant, project: definition.project }) })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(() => createEngineTaskClient({ baseUrl: 'http://engine.example/', qualifiedOrigin: 'http://engine.example', apiKey: 'k' })).toThrow(EngineTaskError);
});

it('(5) routes : clé de service seulement, corps strict, prompt jamais rendu, attente Engine rendue en 409', async () => {
    const run = await readyForImage();
    const app = Fastify();
    const actor = { service: true };
    app.addHook('onRequest', async (req) => { req.workspaceId = ws; if (actor.service) req.apiKeyId = key; else req.userId = human; });
    registerCircuitGenerationRoutes(app, { sql, appUrl, engine: engine(), engineId: 'flux-main', attemptsFor: (id) => new PgCircuitAttempts(sql, id), receiptsFor: (id) => new PgCircuitReceipts(sql, id), storeFor: (id) => new PgCircuitStore(sql, id) });
    const post = (path: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/circuit-runs/${runId}/steps/image/${path}`, payload });
    try {
        actor.service = false;
        expect((await post('generate', { grantId: grant, target, runVersion: run.version, prompt })).json()).toEqual({ error: 'SERVICE_KEY_REQUIRED' });
        actor.service = true;
        expect((await post('generate', { grantId: grant, target, runVersion: run.version })).statusCode).toBe(400);
        expect((await post('generate', { grantId: grant, target, runVersion: run.version, prompt, extra: 1 })).statusCode).toBe(400);
        engineStatus = 'unavailable';
        const waiting = await post('generate', { grantId: grant, target, runVersion: run.version, prompt });
        expect(waiting.statusCode).toBe(409);
        expect(waiting.json()).toEqual({ error: 'ENGINE_UNAVAILABLE', status: 'waiting_engine', runVersion: run.version + 1 });
        engineStatus = 'available';
        const resumed = await store.control(runId, { action: 'retry_engine', expectedVersion: run.version + 1, idempotencyKey: randomUUID() }, human);
        const ok = await post('generate', { grantId: grant, target, runVersion: resumed.version, prompt });
        expect(ok.statusCode).toBe(200);
        expect(ok.json()).toEqual({ jobId: expect.any(String), reused: false, runVersion: resumed.version });
        expect(JSON.stringify(ok.json())).not.toContain('ILLUSTRATION');
        const pending = await post('generation-result', { grantId: grant, target, runVersion: resumed.version });
        expect(pending.statusCode).toBe(202);
        const fileId = randomUUID();
        jobs.set(ok.json().jobId, { status: 'completed', results: [{ fileId, role: 'output', type: 'image/png', downloadUrl: `/api/v1/files/${fileId}` }] });
        const done = await post('generation-result', { grantId: grant, target, runVersion: resumed.version });
        expect(done.statusCode).toBe(200);
        expect(done.json()).toMatchObject({ reused: false, runVersion: resumed.version + 1, reference: { id: fileId, kind: 'image' } });
        // Rejeu après avancement : la délégation (SQL) refuse la version périmée, aucun second reçu.
        const replay = await post('generation-result', { grantId: grant, target, runVersion: resumed.version });
        expect(replay.statusCode).toBe(409); expect(replay.json()).toEqual({ error: 'STALE_EXECUTION' });
        expect(await receiptRows()).toHaveLength(1);
    } finally { await app.close(); }
});
