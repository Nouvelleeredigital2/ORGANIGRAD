import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Sql } from 'postgres';
import { buildPgServer, type PgServerDeps } from '../src/api/pgServer.js';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const ID = '44444444-4444-4444-8444-444444444444';
const NEXT_ID = '55555555-5555-4555-8555-555555555555';
const SECRET = 'local-project-route-test-signing-secret';
const UPDATED = '2026-09-09T12:00:00.123456Z';
const project = {
    id: ID, workspace_id: WS, name: 'Real project', description: 'Product work',
    archived_at: null, created_at: '2026-09-08T12:00:00.000000Z', updated_at: UPDATED, version: 1,
};
const activity = {
    id: NEXT_ID, title: 'Actual task', status: 'running', updated_at: UPDATED, archived_at: null,
};

function token(sub = USER, exp = Math.floor(Date.now() / 1000) + 3600, secret = SECRET) {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sub, exp })).toString('base64url');
    return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}

type Query = { text: string; values: unknown[]; transaction: boolean; phase: 'auth' | 'read' };
type Fixture = {
    authRole?: string | null;
    currentRole?: string | null;
    projects?: Record<string, unknown>[];
    summary?: Record<string, unknown>;
    members?: unknown;
    activity?: Record<string, unknown>[];
    fail?: 'auth' | 'authTimeouts' | 'begin' | 'timeouts' | 'member' | 'project' | 'summary' | 'count' | 'activity' | 'commit';
};

// Only the database boundary is replaced. JWT verification, scopes, Fastify hooks,
// route registration, serialization and errors all run as in the real server.
function database(fixture: Fixture = {}) {
    const queries: Query[] = [];
    const transactions: string[] = [];
    // Appât : porte les cinq mots que l'assertion de non-fuite traque plus bas
    // (sql, password, postgres, profiles, email). Volontairement PAS sous forme
    // de chaîne de connexion : le contrôle « valeur secrète » de la CI y voit un
    // vrai DSN, et un appât de test ne doit pas rendre ce garde-fou ininterprétable.
    const failure = () => { throw new Error('SQL failure: password of the postgres role, read from profiles.email'); };
    const tag = (transaction: boolean, phase: 'auth' | 'read' = 'auth') => async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
        queries.push({ text, values, transaction, phase });
        if (text.includes('set_config(')) {
            if ((fixture.fail === 'timeouts' && phase === 'read') ||
                (fixture.fail === 'authTimeouts' && phase === 'auth')) failure();
            return [];
        }
        if (phase === 'auth') {
            if (fixture.fail === 'auth') failure();
            if (!text.includes('select role from public.workspace_members')) throw new Error('Unexpected auth SQL');
            const role = fixture.authRole === undefined ? 'viewer' : fixture.authRole;
            return role ? [{ role }] : [];
        }
        if (text.includes('select role from public.workspace_members')) {
            if (fixture.fail === 'member') failure();
            const role = fixture.currentRole === undefined ? 'viewer' : fixture.currentRole;
            return role ? [{ role }] : [];
        }
        if (text.includes('from public.projects')) {
            if (fixture.fail === 'project') failure();
            return fixture.projects ?? [project];
        }
        if (text.includes('from public.project_tasks') && text.includes('count(*)')) {
            if (fixture.fail === 'summary') failure();
            return [fixture.summary ?? { total: '7', done: '3', running: '2', blocked: '1' }];
        }
        if (text.includes('from public.workspace_members') && text.includes('count(*)')) {
            if (fixture.fail === 'count') failure();
            return [{ count: fixture.members === undefined ? '4' : fixture.members }];
        }
        if (text.includes('from public.project_tasks')) {
            if (fixture.fail === 'activity') failure();
            return fixture.activity ?? [activity];
        }
        throw new Error(`Unexpected transaction query: ${text}`);
    };
    const sql = Object.assign(tag(false), {
        begin: async (options: string, callback: (tx: unknown) => Promise<unknown>) => {
            transactions.push(options);
            const phase = transactions.length % 2 === 1 ? 'auth' : 'read';
            if (fixture.fail === 'begin' && phase === 'read') failure();
            const result = await callback(tag(true, phase));
            if (fixture.fail === 'commit' && phase === 'read') failure();
            return result;
        },
    }) as unknown as Sql;
    return { sql, queries, transactions };
}

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

function setup(fixture: Fixture = {}, enabled: unknown = true, overrides: Partial<PgServerDeps> = {}) {
    const db = database(fixture);
    const deps = { sql: db.sql, jwtSecret: SECRET, ...overrides,
        ...(enabled === undefined ? {} : { projectsEnabled: enabled }),
    } as PgServerDeps;
    const app = buildPgServer(deps);
    apps.push(app);
    const get = (url = '/api/projects', headers: Record<string, string> = {}) => app.inject({
        method: 'GET', url,
        headers: { authorization: `Bearer ${token()}`, 'x-workspace-id': WS, ...headers },
    });
    return { app, get, ...db };
}

const urls = ['/api/projects', `/api/projects/${ID}/context`];

describe('project reads: explicit opt-in and verified human authorization', () => {
    it.each([false, 'true', 1, null])('does not register with projectsEnabled=%s', async enabled => {
        const { app, get } = setup({}, enabled);
        await app.ready();
        expect(app.hasRoute({ method: 'GET', url: '/api/projects' })).toBe(false);
        expect(app.hasRoute({ method: 'GET', url: '/api/projects/:projectId/context' })).toBe(false);
        for (const url of urls) expect((await get(url)).statusCode).toBe(404);
    });

    it('defaults to disabled when the flag is absent', async () => {
        const app = buildPgServer({ sql: database().sql, jwtSecret: SECRET });
        apps.push(app);
        await app.ready();
        expect(app.hasRoute({ method: 'GET', url: '/api/projects' })).toBe(false);
        expect(app.hasRoute({ method: 'GET', url: '/api/projects/:projectId/context' })).toBe(false);
    });

    it('returns 401 with no authentication headers at all', async () => {
        const { app, queries } = setup();
        const response = await app.inject({ method: 'GET', url: '/api/projects' });
        expect(response.statusCode).toBe(401);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(queries).toHaveLength(0);
    });

    it('requires configured session verification even for a well-formed JWT', async () => {
        const { get, queries } = setup({}, true, { jwtSecret: undefined });
        expect((await get()).statusCode).toBe(401);
        expect(queries).toHaveLength(0);
    });

    it('keeps the same authorization and cache policy for automatic HEAD routes', async () => {
        const { app, queries } = setup();
        const response = await app.inject({ method: 'HEAD', url: '/api/projects',
            headers: { authorization: 'Bearer ok_technical', 'x-workspace-id': WS } });
        expect(response.statusCode).toBe(403);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.body).toBe('');
        expect(queries).toHaveLength(0);
    });

    it('does not register product mutations', async () => {
        const { app } = setup();
        await app.ready();
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
            expect(app.hasRoute({ method, url: '/api/projects' })).toBe(false);
            expect(app.hasRoute({ method, url: '/api/projects/:projectId/context' })).toBe(false);
        }
    });

    it.each(['owner', 'admin', 'member', 'viewer'])('allows current %s with real signed JWT', async role => {
        const { get } = setup({ authRole: role, currentRole: role });
        for (const url of urls) {
            const response = await get(url);
            expect(response.statusCode).toBe(200);
            expect(response.headers['cache-control']).toBe('private, no-store');
        }
    });

    it.each(urls)('rejects unverified identities and keys before data SQL on %s', async url => {
        for (const [bearer, status] of [
            ['', 401], ['Bearer garbage', 401], [`Bearer ${token(USER, 1)}`, 401],
            [`Bearer ${token(USER, undefined, 'wrong-secret')}`, 401],
            ['Bearer ok_key_with_graph_read', 403],
        ] as const) {
            const { get, queries, transactions } = setup();
            const response = await get(url, { authorization: bearer });
            expect(response.statusCode).toBe(status);
            expect(response.headers['cache-control']).toBe('private, no-store');
            expect(queries).toHaveLength(0);
            expect(transactions).toHaveLength(0);
        }
    });

    it.each(urls)('requires workspace UUID on %s', async url => {
        for (const workspace of ['', 'not-a-uuid', `${WS}' OR true --`]) {
            const { get, queries } = setup();
            const response = await get(url, { 'x-workspace-id': workspace });
            expect(response.statusCode).toBe(400);
            expect(queries).toHaveLength(0);
        }
    });

    it('rejects a verified token with a non-UUID subject before a transaction', async () => {
        const { get, transactions } = setup();
        expect((await get('/api/projects', { authorization: `Bearer ${token('invalid-user')}` })).statusCode).toBe(400);
        expect(transactions).toHaveLength(0);
    });

    it.each(urls)('denies other workspace and absent/readless membership on %s', async url => {
        for (const fixture of [
            { authRole: null }, { authRole: 'unknown' },
            { currentRole: null }, { currentRole: 'unknown' },
        ]) {
            const { get, queries } = setup(fixture);
            const response = await get(url, { 'x-workspace-id': OTHER_WS });
            expect(response.statusCode).toBe(403);
            expect(response.headers['cache-control']).toBe('private, no-store');
            expect(queries.every(q => q.text.includes('select role') || q.text.includes('set_config('))).toBe(true);
            expect(queries.find(q => q.text.includes('select role'))?.values).toEqual([OTHER_WS, USER]);
        }
    });
});

describe('GET /api/projects', () => {
    it('returns only safe snake_case fields, with bounded strings and a bounded SQL read', async () => {
        const { get, queries, transactions } = setup({ projects: [{
            ...project, name: 'n'.repeat(1000), description: 'd'.repeat(3000),
            secret: 'hidden', email: 'private@example.com', remote_url: 'http://internal/',
        }] });
        const response = await get();
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ projects: [{ ...project, name: 'n'.repeat(160), description: 'd'.repeat(500) }] });
        expect(transactions).toEqual(Array(2).fill('isolation level repeatable read read only'));
        expect(queries).toHaveLength(5);
        expect(queries.every(q => q.transaction)).toBe(true);
        const query = queries[4]!;
        expect(query.text).toContain('workspace_id = ?');
        // Sort the indexed timestamp column, not the formatted SELECT alias.
        expect(query.text).toContain('order by public.projects.updated_at desc, id desc');
        expect(query.text).toContain('limit ?');
        expect(query.text).not.toContain('select *');
        expect(query.values).toContain(WS);
        expect(query.values.at(-1)).toBe(26);
    });

    it('returns an empty list without invented projects', async () => {
        const { get } = setup({ projects: [] });
        expect((await get()).json()).toEqual({ projects: [] });
    });

    it('bounds labels by Unicode characters without damaging surrogate pairs', async () => {
        const { get } = setup({ projects: [{ ...project, name: '🚀'.repeat(161) }],
            activity: [{ ...activity, title: '🚀'.repeat(201) }] });
        const response = await get(urls[1]);
        expect(response.json().project.name).toBe('🚀'.repeat(160));
        expect(response.json().recentActivity[0].title).toBe('🚀'.repeat(200));
    });

    it.each([
        { workspaceId: WS, updatedAt: '2026-02-31T12:00:00.123456Z', id: ID },
        { workspaceId: WS, updatedAt: 'infinity', id: ID },
        { workspaceId: WS, updatedAt: UPDATED, id: `${ID}' OR true --` },
        { workspaceId: WS, updatedAt: UPDATED, id: ID, remoteUrl: 'http://private/' },
        null,
    ])('rejects malformed decoded cursors %#', async cursor => {
        const { get, transactions } = setup();
        const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64url');
        expect((await get(`/api/projects?cursor=${encoded}`)).statusCode).toBe(400);
        expect(transactions).toHaveLength(1); // Only the bounded authentication lookup.
    });

    it('uses one lookahead and a workspace-bound cursor preserving timestamp microseconds', async () => {
        const first = setup({ projects: [project, { ...project, id: NEXT_ID }] });
        const response = await first.get('/api/projects?limit=1');
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.projects).toEqual([project]);
        expect(typeof body.nextCursor).toBe('string');
        expect(body.nextCursor.length).toBeLessThan(512);
        expect(Buffer.from(body.nextCursor, 'base64url').toString()).toContain(UPDATED);
        const next = setup({ projects: [{ ...project, id: NEXT_ID }] });
        const nextResponse = await next.get(`/api/projects?limit=1&cursor=${body.nextCursor}`);
        expect(nextResponse.json()).toEqual({ projects: [{ ...project, id: NEXT_ID }] });
        const query = next.queries.at(-1)!;
        expect(query.text).toMatch(/\(updated_at, id\) < \(\?::timestamptz, \?::uuid\)/);
        expect(query.values).toContain(UPDATED);
        expect(query.values).toContain(ID);
        expect(query.text).not.toContain(UPDATED);
        const crossWorkspace = setup();
        expect((await crossWorkspace.get(`/api/projects?cursor=${body.nextCursor}`, { 'x-workspace-id': OTHER_WS })).statusCode).toBe(400);
        expect(crossWorkspace.transactions).toHaveLength(1);
    });

    it('caps the largest page and reply even if a SQL adapter overreturns', async () => {
        const { get, queries } = setup({ projects: Array.from({ length: 120 }, () => project) });
        const response = await get('/api/projects?limit=100');
        expect(response.json().projects).toHaveLength(100);
        expect(queries.at(-1)?.values.at(-1)).toBe(101);
        expect(response.body.length).toBeLessThan(150_000);
    });

    it.each(['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=Infinity', 'limit=1e2',
        'limit=', 'limit=1&limit=2', 'cursor=bad', 'cursor=', `cursor=${'a'.repeat(513)}`,
        'url=http://127.0.0.1/private', 'workspace_id=other'])('rejects invalid pagination/input %s', async query => {
        const { get, transactions } = setup();
        const response = await get(`/api/projects?${query}`);
        expect(response.statusCode).toBe(400);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(transactions).toHaveLength(1);
    });
});

describe('GET /api/projects/:projectId/context', () => {
    it('reads real summaries and activity in the same authorized snapshot with a fixed query budget', async () => {
        const { get, queries, transactions } = setup({ activity: [{
            ...activity, title: 't'.repeat(1000), secret: 'hidden', assignee_email: 'private@example.com',
        }] });
        const response = await get(urls[1]);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            project, taskSummary: { total: 7, done: 3, running: 2, blocked: 1 },
            workspaceMemberCount: 4, recentActivity: [{ ...activity, title: 't'.repeat(200) }],
        });
        expect(transactions).toEqual(Array(2).fill('isolation level repeatable read read only'));
        expect(queries).toHaveLength(8);
        expect(queries.every(q => q.transaction)).toBe(true);
        expect(queries[3]?.values).toEqual([WS, USER]);
        for (const q of queries.slice(4)) {
            expect(q.text).toContain('workspace_id = ?');
            expect(q.values).toContain(WS);
            expect(q.text).not.toMatch(/select \*|profiles|email|secret|https?:/);
        }
        for (const q of queries.filter(q => q.text.includes('project_tasks'))) {
            expect(q.text).toContain('project_id = ?');
            expect(q.values).toContain(ID);
        }
        const summary = queries.find(q => q.text.includes('project_tasks') && q.text.includes('count(*)'))!;
        expect(summary.text).toContain('archived_at is null');
        for (const status of ['done', 'running', 'blocked']) expect(summary.text).toContain(`status = '${status}'`);
        const recent = queries.at(-1)!;
        expect(recent.text).toContain('order by updated_at desc, id desc');
        expect(recent.text).toMatch(/limit (10|\?)/);
    });

    it('keeps archived projects readable and reports zero counters/activity without fabrication', async () => {
        const archived = { ...project, archived_at: UPDATED };
        const { get } = setup({ projects: [archived], summary: { total: '0', done: '0', running: '0', blocked: '0' }, activity: [] });
        expect((await get(urls[1])).json()).toEqual({ project: archived,
            taskSummary: { total: 0, done: 0, running: 0, blocked: 0 }, workspaceMemberCount: 4, recentActivity: [] });
    });

    it('caps activity at ten safe entries and makes no LINK binding claim', async () => {
        const { get } = setup({ activity: Array.from({ length: 15 }, () => activity) });
        const response = await get(urls[1]);
        expect(response.json().recentActivity).toHaveLength(10);
        expect(response.body).not.toMatch(/link|spaceId|binding|email|remote_url/i);
    });

    it('normalizes driver Date values and numeric counts to safe JSON', async () => {
        const { get } = setup({
            projects: [{ ...project, created_at: new Date('2026-09-08T12:00:00Z') }],
            summary: { total: 0, done: 0, running: 0, blocked: 0 }, members: 1,
            activity: [{ ...activity, updated_at: new Date('2026-09-09T12:00:00Z') }],
        });
        const response = await get(urls[1]);
        expect(response.statusCode).toBe(200);
        expect(response.json().project.created_at).toBe('2026-09-08T12:00:00.000Z');
        expect(response.json().recentActivity[0].updated_at).toBe('2026-09-09T12:00:00.000Z');
        expect(response.json().workspaceMemberCount).toBe(1);
    });

    it('does not accept arbitrary URL or workspace parameters on context', async () => {
        const { get, transactions } = setup();
        expect((await get(`${urls[1]}?url=http://localhost/`)).statusCode).toBe(400);
        expect(transactions).toHaveLength(1);
    });

    it('fails closed on a non-finite workspace member count', async () => {
        const { get } = setup({ members: Infinity });
        const response = await get(urls[1]);
        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ error: 'PROJECTS_UNAVAILABLE' });
    });

    it('returns 404 for missing or out-of-workspace project without reading its tasks', async () => {
        const { get, queries } = setup({ projects: [] });
        const response = await get(urls[1]);
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: 'PROJECT_NOT_FOUND' });
        expect(queries).toHaveLength(5);
    });

    it.each(['bad', `${ID}' OR true --`, '1234'])('returns 400 for invalid project UUID %s', async id => {
        const { get, transactions } = setup();
        expect((await get(`/api/projects/${encodeURIComponent(id)}/context`)).statusCode).toBe(400);
        expect(transactions).toHaveLength(1);
    });

    it.each(['NaN', 'Infinity', '-1', '1.5', '9007199254740992', null, ''])('fails closed on invalid integer counts %s', async count => {
        const { get } = setup({ summary: { total: count, done: '0', running: '0', blocked: '0' } });
        const response = await get(urls[1]);
        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ error: 'PROJECTS_UNAVAILABLE' });
    });
});

describe('project read failure containment', () => {
    it.each(urls)('sets local statement/lock timeouts before snapshot membership and reads on %s', async url => {
        const { get, queries } = setup();
        expect((await get(url)).statusCode).toBe(200);
        expect(queries.every(q => q.transaction)).toBe(true);
        for (const phase of ['auth', 'read']) {
            const firstInTransaction = queries.find(q => q.phase === phase)!;
            expect(firstInTransaction.text).toContain("set_config('statement_timeout', '5s', true)");
            expect(firstInTransaction.text).toContain("set_config('lock_timeout', '1s', true)");
            expect(firstInTransaction.values).toEqual([]);
        }
        expect(queries[3]?.text).toContain('select role from public.workspace_members');
    });

    it.each(['auth', 'authTimeouts', 'begin', 'timeouts', 'member', 'project', 'commit'] as const)(
        'also contains %s failures on the list', async fail => {
            const { get } = setup({ fail });
            const response = await get();
            expect(response.statusCode).toBe(503);
            expect(response.json()).toEqual({ error: 'PROJECTS_UNAVAILABLE' });
            expect(response.headers['cache-control']).toBe('private, no-store');
        },
    );
    it.each(['auth', 'authTimeouts', 'begin', 'timeouts', 'member', 'project', 'summary', 'count', 'activity', 'commit'] as const)(
        'returns generic private 503 for %s failures', async fail => {
            const { get } = setup({ fail });
            const response = await get(urls[1]);
            expect(response.statusCode).toBe(503);
            expect(response.json()).toEqual({ error: 'PROJECTS_UNAVAILABLE' });
            expect(response.headers['cache-control']).toBe('private, no-store');
            expect(response.body).not.toMatch(/sql|password|postgres|profiles|email/i);
        },
    );
});
