import { test as base, expect, type BrowserContext } from '@playwright/test';
import type { Project, ProjectTask } from '../src/types/project';

export const ORIGIN = 'http://127.0.0.1:5174';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
export const USER = '22222222-2222-4222-8222-222222222222';
const KEY = 'sb_publishable_TEST_SYNapse_dummy_not_a_key';
const FONT = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
const timestamp = '2026-09-09T12:00:00.000Z';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A tiny in-memory HTTP fixture, NOT Supabase, SQL, RLS, or an auth service.
export class ProjectsFixture {
    role: 'owner' | 'viewer' = 'owner';
    projects: Project[] = [];
    tasks: ProjectTask[] = [];
    requests: string[] = [];
    violations: string[] = [];
    blocked: string[] = [];
    mutations: string[] = [];

    async install(context: BrowserContext) {
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER, role: 'authenticated', exp: expires, iss: `${ORIGIN}/__test_supabase/auth/v1` })}.TEST_ONLY_NOT_SIGNED`;
        await context.addInitScript(({ origin, token, expires, user, workspace }) => {
            if (location.origin !== origin) return;
            localStorage.setItem('organigrad-auth', JSON.stringify({
                access_token: token, refresh_token: 'TEST_ONLY_NO_REFRESH', token_type: 'bearer',
                expires_at: expires, expires_in: 3600,
                user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'test-synapse@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-09-09T12:00:00Z' },
            }));
            localStorage.setItem('organigrad_active_workspace_id', workspace);
        }, { origin: ORIGIN, token, expires, user: USER, workspace: WORKSPACE });

        await context.routeWebSocket('**/*', socket => {
            const url = new URL(socket.url());
            if (url.origin === 'ws://127.0.0.1:5174' && url.pathname === '/' && [...url.searchParams.keys()].join() === 'token') {
                this.blocked.push('Vite loopback HMR WebSocket');
            } else this.violations.push(`Unexpected WebSocket: ${socket.url()}`);
            socket.close(); // Never connect to the server, including loopback Realtime/HMR.
        });
        await context.route('**/*', async route => {
            const request = route.request();
            const url = new URL(request.url());
            const method = request.method();
            const label = `${method} ${url.pathname}${url.search}`;
            const reject = async (reason: string) => {
                this.violations.push(`${reason}: ${label}`);
                await route.abort('blockedbyclient');
            };
            if (url.origin !== ORIGIN) {
                this.blocked.push(request.url());
                // The existing stylesheet imports exactly this font. Use local fallback fonts.
                if (request.url() !== FONT || method !== 'GET' || request.resourceType() !== 'stylesheet') {
                    this.violations.push(`Unexpected outbound request: ${method} ${request.url()}`);
                }
                await route.abort('blockedbyclient');
                return;
            }
            if (!url.pathname.startsWith('/__test_supabase/')) {
                if (method === 'GET' && url.pathname === '/data.csv') {
                    await route.fulfill({ contentType: 'text/csv', body: 'id,nom\n' });
                } else if (method === 'GET' && (
                    (url.pathname === '/' && request.isNavigationRequest()) ||
                    /^\/brand\/favicon(?:-32\.png|\.ico)$/.test(url.pathname) ||
                    (['script', 'stylesheet', 'image', 'font'].includes(request.resourceType()) &&
                        /^\/(?:src\/|node_modules\/vite\/dist\/client\/env\.mjs$|node_modules\/\.vite\/|e2e-projects\/test-results\/\.vite\/|@vite\/client$|@react-refresh$|@id\/|brand\/)/.test(url.pathname))
                )) {
                    await route.continue();
                } else await reject('Unknown application route');
                return;
            }
            this.requests.push(label);
            try {
                expect(request.headers()['apikey']).toBe(KEY);
                expect(request.headers()['authorization']).toBe(`Bearer ${token}`);
                const path = url.pathname;
                const query = Object.fromEntries(url.searchParams);
                const json = async (body: unknown, status = 200) => route.fulfill({ status, json: body });
                if (method === 'GET' && path === '/__test_supabase/rest/v1/workspace_members') {
                    if (query.select === 'role,workspace:workspaces(*)') {
                        expect(query).toEqual({ select: 'role,workspace:workspaces(*)', user_id: `eq.${USER}`, order: 'created_at.asc' });
                        await json([{ role: this.role, workspace: { id: WORKSPACE, name: 'TEST-SYNAPSE workspace', owner_id: USER, created_at: timestamp, updated_at: timestamp } }]);
                    } else if (query.select === 'role') {
                        expect(query).toEqual({ select: 'role', workspace_id: `eq.${WORKSPACE}`, user_id: `eq.${USER}` });
                        await json([{ role: this.role }]);
                    } else {
                        expect(query).toEqual({ select: 'user_id', workspace_id: `eq.${WORKSPACE}`, order: 'user_id.asc', offset: '0', limit: '100' });
                        await json([{ user_id: USER }]);
                    }
                    return;
                }
                if (method === 'GET' && path === '/__test_supabase/rest/v1/profiles') {
                    expect(query).toEqual({ select: 'id,display_name', id: `in.(${USER})`, order: 'id.asc', offset: '0', limit: '100' });
                    await json([{ id: USER, display_name: 'TEST-SYNAPSE member' }]);
                    return;
                }
                if (method === 'GET' && path === '/__test_supabase/rest/v1/org_agents') {
                    expect(query).toEqual({ select: '*', workspace_id: `eq.${WORKSPACE}`, order: 'created_at.asc' });
                    await json([]);
                    return;
                }
                const isTask = path === '/__test_supabase/rest/v1/project_tasks';
                if (!isTask && path !== '/__test_supabase/rest/v1/projects') throw new Error('Unknown Supabase endpoint');
                const rows = isTask ? this.tasks : this.projects;
                const projectScope = isTask ? { project_id: `eq.${this.projects[0]?.id}` } : {};
                if (method === 'GET') {
                    expect(query).toEqual({ select: '*', workspace_id: `eq.${WORKSPACE}`, ...projectScope,
                        ...(query.id ? { id: query.id } : { order: isTask ? 'created_at.asc,id.asc' : 'created_at.desc,id.asc', offset: '0', limit: '100' }) });
                    if (query.id) expect(query.id.slice(3)).toMatch(uuid);
                    await json(query.id ? rows.filter(row => `eq.${row.id}` === query.id) : rows);
                    return;
                }
                expect(this.role, 'Viewer must never send a mutation').toBe('owner');
                const body = request.postDataJSON();
                if (method === 'POST') {
                    expect(query).toEqual({ select: '*' });
                    expect(Object.keys(body).sort()).toEqual((isTask
                        ? ['id', 'workspace_id', 'project_id', 'title', 'description', 'status', 'assignee_id', 'due_date']
                        : ['id', 'workspace_id', 'name', 'description']).sort());
                    expect(body.id).toMatch(uuid);
                    expect(body.workspace_id).toBe(WORKSPACE);
                    expect(rows.some(row => row.id === body.id)).toBe(false);
                    if (isTask) expect(body.project_id).toBe(this.projects[0]?.id);
                    const row = { ...body, archived_at: null, version: 1, created_at: timestamp, updated_at: timestamp };
                    if (isTask) this.tasks.push(row); else this.projects.push(row);
                    this.mutations.push(label);
                    await json(row, 201);
                    return;
                }
                if (method === 'PATCH') {
                    const row = rows.find(row => `eq.${row.id}` === query.id);
                    expect(row, 'PATCH target must exist').toBeDefined();
                    expect(query).toEqual({ select: '*', workspace_id: `eq.${WORKSPACE}`, ...projectScope, id: `eq.${row!.id}`, version: `eq.${row!.version}` });
                    const allowed = isTask ? ['title', 'description', 'status', 'assignee_id', 'due_date', 'archived_at', 'version'] : ['name', 'description', 'archived_at', 'version'];
                    expect(body.version).toBe(row!.version + 1);
                    expect(Object.keys(body).length).toBeGreaterThan(0);
                    expect(Object.keys(body).every(key => allowed.includes(key))).toBe(true);
                    Object.assign(row!, body, { version: row!.version + 1, updated_at: new Date().toISOString() });
                    this.mutations.push(label);
                    await json(row);
                    return;
                }
                throw new Error('Unknown Supabase method');
            } catch (error) {
                await reject(String(error));
            }
        });
    }
}

export const test = base.extend<{ fixture: ProjectsFixture }>({
    fixture: [async ({ context }, useFixture, testInfo) => {
        const fixture = new ProjectsFixture();
        const pageErrors: string[] = [];
        context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
        await fixture.install(context);
        try { await useFixture(fixture); }
        finally {
            await context.close(); // Keep the deny-by-default routes installed until the browser context is closed.
            await testInfo.attach('fixture-network-audit', { body: JSON.stringify({ requests: fixture.requests, mutations: fixture.mutations, blocked: fixture.blocked, violations: fixture.violations, pageErrors }, null, 2), contentType: 'application/json' });
            expect(fixture.violations, 'Unknown HTTP/WebSocket requests must fail the test').toEqual([]);
            expect(pageErrors, 'Uncaught browser errors').toEqual([]);
        }
    }, { auto: true }],
});
export { expect };
