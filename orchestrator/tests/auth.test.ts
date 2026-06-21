import { describe, it, expect, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { buildAuthHook } from '../src/api/auth.js';

/**
 * Tests du hook d'authentification API key.
 * Le SQL est mocké : on vérifie le comportement du hook seul.
 */

type KeyRow = {
    id: string;
    workspace_id: string;
    scopes?: string[];
    expires_at?: string | null;
};

function makeSql(found: KeyRow | null) {
    // Le SELECT renvoie la ligne (ou []) ; l'UPDATE last_used_at renvoie []. On
    // distingue par la présence du mot-clé "update" dans le template.
    const tag = vi.fn((strings: TemplateStringsArray) => {
        const sqlText = strings.join(' ').toLowerCase();
        if (sqlText.includes('update')) return Promise.resolve([]);
        return Promise.resolve(found ? [found] : []);
    });
    return tag as unknown as import('postgres').Sql;
}

describe('buildAuthHook', () => {
    it("rejette 401 quand le header Authorization manque", async () => {
        const app = Fastify();
        const sql = makeSql(null);
        app.addHook('onRequest', buildAuthHook({ sql }));
        app.get('/api/x', async () => ({ ok: true }));
        const res = await app.inject({ method: 'GET', url: '/api/x' });
        expect(res.statusCode).toBe(401);
        expect(res.json().error).toBe('MISSING_BEARER_TOKEN');
        await app.close();
    });

    it('rejette 401 si la clé est inconnue ou révoquée', async () => {
        const app = Fastify();
        const sql = makeSql(null);
        app.addHook('onRequest', buildAuthHook({ sql }));
        app.get('/api/x', async () => ({ ok: true }));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: 'Bearer ok_invalid' },
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().error).toBe('INVALID_OR_REVOKED_KEY');
        await app.close();
    });

    it('accepte une clé valide et peuple workspaceId/apiKeyId', async () => {
        const sql = makeSql({ id: 'key-1', workspace_id: 'ws-42' });
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql }));
        app.get('/api/x', async (req) => ({
            ws: req.workspaceId,
            kid: req.apiKeyId,
        }));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: 'Bearer ok_validtoken' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ws: 'ws-42', kid: 'key-1' });
        await app.close();
    });

    it('hash le token en SHA-256 avant le SELECT', async () => {
        const captured: unknown[] = [];
        const sql = vi.fn((_strings: TemplateStringsArray, ...args: unknown[]) => {
            captured.push(...args);
            return Promise.resolve([{ id: 'k', workspace_id: 'w' }]);
        }) as unknown as import('postgres').Sql;
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql }));
        app.get('/api/x', async () => ({}));
        const raw = 'ok_supertoken';
        await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: `Bearer ${raw}` },
        });
        const expected = createHash('sha256').update(raw).digest('hex');
        expect(captured).toContain(expected);
        await app.close();
    });

    it('rejette 401 si la clé est expirée', async () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        const sql = makeSql({ id: 'k', workspace_id: 'w', scopes: ['graph:read'], expires_at: past });
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql }));
        app.get('/api/x', async () => ({ ok: true }));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: 'Bearer ok_expired' },
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().error).toBe('EXPIRED_KEY');
        await app.close();
    });

    it('accepte une clé future et expose ses scopes', async () => {
        const future = new Date(Date.now() + 3_600_000).toISOString();
        const sql = makeSql({
            id: 'k',
            workspace_id: 'w',
            scopes: ['graph:read', 'node:run'],
            expires_at: future,
        });
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql }));
        app.get('/api/x', async (req) => ({ scopes: req.scopes }));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: 'Bearer ok_valid' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().scopes).toEqual(['graph:read', 'node:run']);
        await app.close();
    });
});

describe('buildAuthHook — session utilisateur (JWT)', () => {
    const JWT_SECRET = 'jwt-secret-test';
    const future = Math.floor(Date.now() / 1000) + 3600;
    const signJwt = (payload: Record<string, unknown>) => {
        const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const s = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
        return `${h}.${p}.${s}`;
    };
    const sqlWithRole = (role: string | null) =>
        vi.fn((strings: TemplateStringsArray) => {
            const t = strings.join(' ').toLowerCase();
            if (t.includes('workspace_members')) return Promise.resolve(role ? [{ role }] : []);
            return Promise.resolve([]);
        }) as unknown as import('postgres').Sql;

    it('accepte un JWT valide + membre et applique les scopes du rôle', async () => {
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql: sqlWithRole('admin'), jwtSecret: JWT_SECRET }));
        app.get('/api/x', async (req) => ({ userId: req.userId, ws: req.workspaceId, scopes: req.scopes }));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: `Bearer ${signJwt({ sub: 'user-9', exp: future })}`, 'x-workspace-id': 'ws-7' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().userId).toBe('user-9');
        expect(res.json().scopes).toContain('human:approve');
        await app.close();
    });

    it('403 si l\'utilisateur n\'est pas membre du workspace', async () => {
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql: sqlWithRole(null), jwtSecret: JWT_SECRET }));
        app.get('/api/x', async () => ({}));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: `Bearer ${signJwt({ sub: 'u', exp: future })}`, 'x-workspace-id': 'ws-7' },
        });
        expect(res.statusCode).toBe(403);
        await app.close();
    });

    it('400 si X-Workspace-Id manque', async () => {
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql: sqlWithRole('admin'), jwtSecret: JWT_SECRET }));
        app.get('/api/x', async () => ({}));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: `Bearer ${signJwt({ sub: 'u', exp: future })}` },
        });
        expect(res.statusCode).toBe(400);
        await app.close();
    });

    it('401 si le JWT est invalide', async () => {
        const app = Fastify();
        app.addHook('onRequest', buildAuthHook({ sql: sqlWithRole('admin'), jwtSecret: JWT_SECRET }));
        app.get('/api/x', async () => ({}));
        const res = await app.inject({
            method: 'GET',
            url: '/api/x',
            headers: { authorization: 'Bearer eyJ.invalid.token', 'x-workspace-id': 'ws-7' },
        });
        expect(res.statusCode).toBe(401);
        await app.close();
    });
});
