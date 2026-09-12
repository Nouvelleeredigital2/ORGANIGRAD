/**
 * GET/POST/PUT/DELETE /api/bots(...) — wiring, scopes et mapping d'erreurs.
 *
 * La logique de compilation/validation est couverte par botMutation.test.ts ;
 * ici on vérifie que chaque route exige le bon scope, que le corps invalide
 * est rejeté à 400 avant tout accès SQL, et que les requêtes légitimes
 * atteignent bien `public.bot_profiles` / `public.hybrid_nodes`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { sha256Hex } from '../src/domain/botProfile.js';

const JWT_SECRET = 'jwt-secret-test-bots';
const FUTURE = Math.floor(Date.now() / 1000) + 3600;
function signJwt(payload: Record<string, unknown>): string {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const s = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
    return `${h}.${p}.${s}`;
}
const MEMBER_JWT = signJwt({ sub: 'user-member', exp: FUTURE });
const VIEWER_JWT = signJwt({ sub: 'user-viewer', exp: FUTURE });

const BOT_ROW = {
    id: '00000000-0000-4000-8000-000000000001',
    workspace_id: 'ws-1',
    runtime_id: 'anita.instagram.bot',
    file_name: 'anita.instagram.bot.txt',
    display_name: 'Anita',
    family: 'redacteur',
    brand: 'Nature & Tech',
    network: 'instagram',
    telegram_username: null,
    mission: 'Adapter un sujet.',
    personality: '',
    research: '',
    watch: '',
    deliverables: '',
    method: '',
    limits: '',
    useful_context: '',
    sources: [],
    model: {},
    enabled: true,
    compiled_prompt: 'texte compilé',
    compiled_sha256: 'a'.repeat(64),
    updated_at: '2026-09-11T00:00:00.000Z',
    updated_at_text: '2026-09-11T00:00:00.000Z',
};

/** `sql` mock — route par sous-chaîne de la requête, comme pgServerLinkImport.test.ts. */
function makeSql(role: string, opts: { insertRow?: typeof BOT_ROW | null } = {}) {
    const jsonCalls: unknown[] = [];
    const fn = vi.fn((strings: TemplateStringsArray) => {
        const q = String(strings.join(' ')).toLowerCase();
        if (q.includes('workspace_members')) return Promise.resolve([{ role }]);
        if (q.includes('insert into public.bot_profiles')) {
            return Promise.resolve(opts.insertRow === null ? [] : [opts.insertRow ?? BOT_ROW]);
        }
        if (q.includes('update public.bot_profiles')) return Promise.resolve([BOT_ROW]);
        if (q.includes('from public.bot_profiles') && q.includes('order by')) {
            return Promise.resolve([BOT_ROW]);
        }
        if (q.includes('from public.bot_profiles')) {
            return Promise.resolve([BOT_ROW]);
        }
        if (q.includes('delete from public.bot_profiles')) return Promise.resolve([]);
        if (q.includes('exists(') || q.includes('exists (')) return Promise.resolve([{ exists: false }]);
        if (q.includes('insert into public.hybrid_nodes') || q.includes('from public.hybrid_nodes')) {
            return Promise.resolve([
                {
                    id: BOT_ROW.id,
                    workspace_id: 'ws-1',
                    type: 'AGENT_IA',
                    nom: 'Anita',
                    role_titre: 'redacteur · Nature & Tech',
                    parent_id: null,
                    grade_id: 'Agent',
                    system_prompt: null,
                    skills: ['instagram', 'redacteur'],
                    mcp_config: null,
                    notification_channels: null,
                    avatar_url: null,
                    status: 'IDLE',
                    updated_at: '2026-09-11T00:00:00.000Z',
                    updated_at_text: '2026-09-11T00:00:00.000Z',
                },
            ]);
        }
        if (q.includes('update public.hybrid_nodes')) return Promise.resolve([]);
        return Promise.resolve([]);
    });
    (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => {
        jsonCalls.push(v);
        return v;
    };
    // PgGraphStore.upsertNode (appelé par POST /api/bots/:id/link-node) type
    // les compétences via `sql.array(...)`.
    (fn as unknown as { array: (v: unknown) => unknown }).array = (v: unknown) => v;
    Object.assign(fn, { begin: vi.fn(async (callback: (sql: unknown) => unknown) => callback(fn)) });
    return { sql: fn as unknown as import('postgres').Sql, jsonCalls };
}

describe('/api/bots', () => {
    let app: import('fastify').FastifyInstance;

    afterEach(async () => {
        await app?.close();
        vi.clearAllMocks();
    });

    async function build(role: string, opts: { insertRow?: typeof BOT_ROW | null } = {}) {
        const { buildPgServer } = await import('../src/api/pgServer.js');
        const { sql } = makeSql(role, opts);
        app = buildPgServer({ sql, jwtSecret: JWT_SECRET });
        await app.ready();
        return sql;
    }

    const VALID_BODY = {
        id: '00000000-0000-4000-8000-000000000001',
        runtimeId: 'anita.instagram.bot',
        fileName: 'anita.instagram.bot.txt',
        displayName: 'Anita',
        family: 'redacteur',
        network: 'instagram',
        mission: 'Adapter un sujet validé à Instagram.',
    };

    async function inject(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        url: string,
        bearer: string,
        body?: Record<string, unknown>,
    ): Promise<import('light-my-request').Response> {
        return app.inject({
            method,
            url,
            headers: { authorization: `Bearer ${bearer}`, 'x-workspace-id': 'ws-1' },
            ...(body !== undefined ? { payload: body } : {}),
        });
    }

    it('GET /api/bots — un viewer peut lister (botsRead)', async () => {
        await build('viewer');
        const res = await inject('GET', '/api/bots', VIEWER_JWT);
        expect(res.statusCode).toBe(200);
        expect(res.json().bots).toHaveLength(1);
        expect(res.json().bots[0].runtimeId).toBe('anita.instagram.bot');
    });

    it('GET /api/bots/:id — 404 propre si absent', async () => {
        const sql = await build('member', { insertRow: undefined });
        (sql as unknown as ReturnType<typeof vi.fn>).mockImplementation((strings: TemplateStringsArray) => {
            const q = String(strings.join(' ')).toLowerCase();
            if (q.includes('workspace_members')) return Promise.resolve([{ role: 'member' }]);
            if (q.includes('from public.bot_profiles')) return Promise.resolve([]);
            return Promise.resolve([]);
        });
        const res = await inject('GET', '/api/bots/00000000-0000-4000-8000-000000000009', MEMBER_JWT);
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('BOT_NOT_FOUND');
    });

    it('POST /api/bots — 400 avant tout accès SQL si le corps est invalide', async () => {
        const sql = await build('member');
        const res = await inject('POST', '/api/bots', MEMBER_JWT, { ...VALID_BODY, runtimeId: 'Anita Invalide' });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('VALIDATION_ERROR');
        expect((sql as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0].join(' ')).toLowerCase().includes('insert into public.bot_profiles'))).toBe(false);
    });

    it('POST /api/bots — 201 et le prompt est recalculé côté serveur (jamais celui du client)', async () => {
        await build('member');
        const res = await inject('POST', '/api/bots', MEMBER_JWT, {
            ...VALID_BODY,
            compiledPrompt: 'texte fabriqué côté client',
            compiledSha256: 'f'.repeat(64),
        });
        expect(res.statusCode).toBe(201);
        // Le mock renvoie toujours BOT_ROW.compiled_prompt côté "DB" — le point
        // vérifié est que la route ne renvoie PAS le texte envoyé par le client.
        expect(res.json().bot.compiledPrompt).not.toBe('texte fabriqué côté client');
    });

    it('POST /api/bots — 403 pour un viewer (botsWrite manquant)', async () => {
        await build('viewer');
        const res = await inject('POST', '/api/bots', VIEWER_JWT, VALID_BODY);
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('INSUFFICIENT_SCOPE');
    });

    it('creates the graph node in the bot creation transaction', async () => {
        const sql = await build('member');
        const res = await inject('POST', '/api/bots', MEMBER_JWT, VALID_BODY);
        expect(res.statusCode).toBe(201);
        expect(sql.begin).toHaveBeenCalledOnce();
        const queries = (sql as unknown as ReturnType<typeof vi.fn>).mock.calls.map(call => String(call[0]));
        expect(queries.some(query => query.includes('insert into public.hybrid_nodes'))).toBe(true);
    });

    it('DELETE /api/bots/:id — un member ne peut pas supprimer', async () => {
        await build('member');
        const res = await inject('DELETE', `/api/bots/${VALID_BODY.id}`, MEMBER_JWT);
        expect(res.statusCode).toBe(403);
    });

    it('DELETE /api/bots/:id — un admin peut supprimer', async () => {
        await build('admin');
        const res = await inject('DELETE', `/api/bots/${VALID_BODY.id}`, MEMBER_JWT);
        expect(res.statusCode).toBe(204);
    });

    it('PUT requires the loaded version, POST cannot be used to update', async () => {
        await build('member');
        const put = await inject('PUT', `/api/bots/${VALID_BODY.id}`, MEMBER_JWT, VALID_BODY);
        expect(put.statusCode).toBe(400);
        const post = await inject('POST', '/api/bots', MEMBER_JWT, { ...VALID_BODY, updated_at: BOT_ROW.updated_at });
        expect(post.statusCode).toBe(400);
    });

    it('updates the owned node identity in the persona update transaction', async () => {
        const sql = await build('member');
        const res = await inject('PUT', `/api/bots/${VALID_BODY.id}`, MEMBER_JWT, { ...VALID_BODY, updated_at: BOT_ROW.updated_at });
        expect(res.statusCode).toBe(200);
        expect(sql.begin).toHaveBeenCalledOnce();
        const queries = (sql as unknown as ReturnType<typeof vi.fn>).mock.calls.map(call => String(call[0]));
        expect(queries.some(query => query.includes('update public.hybrid_nodes') && query.includes("external_app = 'organigrad-bots'"))).toBe(true);
    });

    it('POST collision returns 409 instead of replacing the existing bot', async () => {
        await build('member', { insertRow: null });
        const res = await inject('POST', '/api/bots', MEMBER_JWT, VALID_BODY);
        expect(res.statusCode).toBe(409);
    });

    it('GET /api/bots/bundle — accessible à un member (scope bots:export accordé aux humains)', async () => {
        await build('member');
        const res = await inject('GET', '/api/bots/bundle', MEMBER_JWT);
        expect(res.statusCode).toBe(200);
        expect(res.json().files).toHaveProperty('anita.instagram.bot.txt');
        expect(res.json().files['anita.instagram.bot.txt']).toMatchObject({
            agent: 'anita.instagram.bot',
        });
        const file = res.json().files['anita.instagram.bot.txt'];
        expect(file.content).toContain('Adapter un sujet.');
        expect(file.content).not.toBe(BOT_ROW.compiled_prompt);
        expect(file.sha256).toBe(sha256Hex(file.content));
    });

    it('POST /api/bots/:id/link-node — crée le nœud AGENT_IA jumeau', async () => {
        await build('member');
        const res = await inject('POST', `/api/bots/${VALID_BODY.id}/link-node`, MEMBER_JWT);
        expect(res.statusCode).toBe(200);
        expect(res.json().node).toMatchObject({ id: VALID_BODY.id, type: 'AGENT_IA', nom: 'Anita' });
    });

    it('link-node preserves an existing node, including a concurrent insertion', async () => {
        const sql = await build('member');
        const mock = sql as unknown as ReturnType<typeof vi.fn>;
        const previous = mock.getMockImplementation()! as (strings: TemplateStringsArray) => unknown;
        mock.mockImplementation((strings: TemplateStringsArray) => {
            const q = strings.join(' ').toLowerCase();
            if (q.includes('insert into public.hybrid_nodes')) return Promise.resolve([]);
            return previous(strings);
        });
        const res = await inject('POST', `/api/bots/${VALID_BODY.id}/link-node`, MEMBER_JWT);
        expect(res.statusCode).toBe(200);
        expect(res.json().created).toBe(false);
        const writes = mock.mock.calls.map((c) => c[0].join(' ').toLowerCase()).filter((q) => q.includes('hybrid_nodes'));
        expect(writes.some((q) => q.includes('on conflict (id) do nothing'))).toBe(true);
        expect(writes.some((q) => /do update|update public.hybrid_nodes/.test(q))).toBe(false);
    });
});
