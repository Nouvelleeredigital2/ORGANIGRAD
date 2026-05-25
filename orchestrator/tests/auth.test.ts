import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { buildAuthHook } from '../src/api/auth.js';

/**
 * Tests du hook d'authentification API key.
 * Le SQL est mocké : on vérifie le comportement du hook seul.
 */

function makeSql(found: { id: string; workspace_id: string } | null) {
    // postgres.js style : sql`...` renvoie un Promise. On simule via tag function.
    const tag = vi.fn().mockResolvedValue(found ? [found] : []);
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
});
