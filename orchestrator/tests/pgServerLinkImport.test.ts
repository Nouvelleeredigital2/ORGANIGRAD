/**
 * POST /api/integrations/link/import — importe les bots Hermes/LINK comme des
 * nœuds AGENT_IA, référencés par leur id LINK stable (pas de copie de prompt,
 * B3). Réservé workspace:admin (session humaine — jamais une clé API, cf.
 * scopes.ts : workspace:admin ∉ DEFAULT_API_KEY_SCOPES).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import type { SafeFetchDeps } from '../src/net/ssrfGuard.js';

vi.mock('../src/synapse/producer.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../src/synapse/producer.js')>();
    return {
        ...original,
        createSynapseProducer: vi.fn(() => ({ onHumanGate: vi.fn(async () => {}), onDecision: vi.fn(async () => {}) })),
    };
});

const hasSpy = vi.fn(async () => false);
const upsertSpy = vi.fn(async (n: unknown) => n);
vi.mock('../src/state/pgGraphStore.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../src/state/pgGraphStore.js')>();
    class PgGraphStoreStub {
        has = hasSpy;
        upsertNode = upsertSpy;
        list = vi.fn(async () => []);
        get = vi.fn(async () => null);
        deleteNode = vi.fn(async () => {});
        on = vi.fn();
        off = vi.fn();
        emit = vi.fn();
    }
    return { ...original, NodeNotFoundError: original.NodeNotFoundError, PgGraphStore: PgGraphStoreStub };
});

vi.mock('../src/observability/auditLog.js', async () => {
    class PgAuditTrailStub {
        record = vi.fn(async () => {});
    }
    return { PgAuditTrail: PgAuditTrailStub };
});

function fakeLookup(map: Record<string, string[]>): SafeFetchDeps['lookup'] {
    return async (host: string) => {
        const addrs = map[host];
        if (!addrs) throw new Error('ENOTFOUND');
        return addrs.map((address) => ({ address, family: 4 }));
    };
}

const JWT_SECRET = 'jwt-secret-test-link-import';
const FUTURE = Math.floor(Date.now() / 1000) + 3600;
function signJwt(payload: Record<string, unknown>): string {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const s = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
    return `${h}.${p}.${s}`;
}
const OWNER_JWT = signJwt({ sub: 'user-owner', exp: FUTURE });

/** Session humaine : `workspace_members.role` = owner (→ scope workspace:admin). */
function makeSql() {
    return vi.fn((strings: TemplateStringsArray) => {
        const q = String(strings.join(' ')).toLowerCase();
        if (q.includes('workspace_members')) return Promise.resolve([{ role: 'owner' }]);
        return Promise.resolve([]);
    }) as unknown as import('postgres').Sql;
}

const AGENTS_BODY = {
    agents: [
        {
            id: 'b992a32c-3293-57fb-b04b-e40ccb65637f',
            name: 'Marina',
            title: 'Veilleuse mariage',
            network: 'mariage',
            role: 'veille',
            channel: 'telegram-hermes',
            enabled: true,
        },
        {
            id: 'disabled-1',
            name: 'Inactif',
            title: 'x',
            network: 'x',
            role: 'veille',
            channel: 'link',
            enabled: false,
        },
    ],
};

function jsonResponse(body: unknown, status = 200): typeof fetch {
    return (async () =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

describe('POST /api/integrations/link/import', () => {
    let app: import('fastify').FastifyInstance;

    beforeEach(() => {
        hasSpy.mockClear();
        upsertSpy.mockClear();
    });

    afterEach(async () => {
        await app?.close();
        vi.clearAllMocks();
    });

    async function buildApp(overrides: Record<string, unknown> = {}) {
        const { buildPgServer } = await import('../src/api/pgServer.js');
        app = buildPgServer({
            sql: makeSql(),
            jwtSecret: JWT_SECRET,
            linkBaseUrl: 'https://link.example.com',
            linkBridgeToken: 'bridge-secret',
            fetchLookup: fakeLookup({ 'link.example.com': ['93.184.216.34'] }),
            fetchImpl: jsonResponse(AGENTS_BODY),
            ...overrides,
        });
        await app.ready();
        return app;
    }

    function call(bearer: string, extraHeaders: Record<string, string> = {}) {
        return app.inject({
            method: 'POST',
            url: '/api/integrations/link/import',
            headers: { authorization: `Bearer ${bearer}`, 'x-workspace-id': 'ws-1', ...extraHeaders },
        });
    }

    it("503 si le pont n'est pas configuré (LINK_BASE_URL/TOKEN absents)", async () => {
        const { buildPgServer } = await import('../src/api/pgServer.js');
        app = buildPgServer({ sql: makeSql(), jwtSecret: JWT_SECRET });
        await app.ready();
        const res = await call(OWNER_JWT);
        expect(res.statusCode).toBe(503);
    });

    it('403 pour une clé API technique (workspace:admin absent des scopes techniques)', async () => {
        // Clé API valide mais sans workspace:admin (scopes par défaut d'une clé technique).
        const sqlWithApiKey = vi.fn((strings: TemplateStringsArray) => {
            const q = String(strings.join(' ')).toLowerCase();
            if (q.includes('workspace_api_keys')) {
                return Promise.resolve([
                    { id: 'key-1', workspace_id: 'ws-1', scopes: ['graph:read', 'node:run'], expires_at: null },
                ]);
            }
            return Promise.resolve([]);
        }) as unknown as import('postgres').Sql;
        await buildApp({ sql: sqlWithApiKey });
        const res = await call('ok_technique000000000000000000');
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('INSUFFICIENT_SCOPE');
        expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('importe les agents actifs, upsert idempotent, ignore les désactivés', async () => {
        await buildApp();
        const res = await call(OWNER_JWT);
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toMatchObject({ ok: true, created: 1, updated: 0, total: 2, skipped: 1 });
        expect(upsertSpy).toHaveBeenCalledTimes(1);
        const [node] = upsertSpy.mock.calls[0] as [Record<string, unknown>];
        expect(node).toMatchObject({
            id: 'b992a32c-3293-57fb-b04b-e40ccb65637f',
            type: 'AGENT_IA',
            nom: 'Marina',
            roleTitre: 'Veilleuse mariage',
            notificationChannels: { telegram: 'telegram-hermes' },
        });
    });

    it('ré-import (agent déjà présent) → updated, pas created', async () => {
        hasSpy.mockResolvedValueOnce(true);
        await buildApp();
        const res = await call(OWNER_JWT);
        expect(res.json()).toMatchObject({ created: 0, updated: 1 });
    });

    it('502 si LINK répond en erreur', async () => {
        await buildApp({ fetchImpl: jsonResponse({ error: 'boom' }, 500) });
        const res = await call(OWNER_JWT);
        expect(res.statusCode).toBe(502);
        expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('502 si LINK est injoignable (erreur réseau)', async () => {
        const rejecting = (async () => {
            throw new Error('ECONNREFUSED');
        }) as unknown as typeof fetch;
        await buildApp({ fetchImpl: rejecting });
        const res = await call(OWNER_JWT);
        expect(res.statusCode).toBe(502);
        expect(upsertSpy).not.toHaveBeenCalled();
    });
});
