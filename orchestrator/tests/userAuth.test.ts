import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySupabaseJwt } from '../src/api/userAuth.js';

const SECRET = 'test-jwt-secret-please-change';

function sign(payload: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
    const h = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    return `${h}.${p}.${sig}`;
}

const future = Math.floor(Date.now() / 1000) + 3600;

describe('verifySupabaseJwt', () => {
    it('accepte un JWT HS256 valide et renvoie sub/email', () => {
        const u = verifySupabaseJwt(sign({ sub: 'user-1', email: 'a@b.fr', exp: future }), SECRET);
        expect(u).toEqual({ sub: 'user-1', email: 'a@b.fr' });
    });

    it('rejette une mauvaise signature (mauvais secret)', () => {
        const token = sign({ sub: 'user-1', exp: future }, 'autre-secret');
        expect(verifySupabaseJwt(token, SECRET)).toBeNull();
    });

    it('rejette un token expiré', () => {
        const past = Math.floor(Date.now() / 1000) - 10;
        expect(verifySupabaseJwt(sign({ sub: 'u', exp: past }), SECRET)).toBeNull();
    });

    it('rejette une charge utile altérée', () => {
        const t = sign({ sub: 'u', exp: future });
        const [h, , s] = t.split('.');
        const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: future })).toString('base64url');
        expect(verifySupabaseJwt(`${h}.${forged}.${s}`, SECRET)).toBeNull();
    });

    it('rejette alg ≠ HS256 (anti "alg: none")', () => {
        const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const p = Buffer.from(JSON.stringify({ sub: 'u', exp: future })).toString('base64url');
        expect(verifySupabaseJwt(`${h}.${p}.`, SECRET)).toBeNull();
    });

    it('rejette un token sans sub ou malformé', () => {
        expect(verifySupabaseJwt(sign({ exp: future }), SECRET)).toBeNull();
        expect(verifySupabaseJwt('pas.un.jwt.valide', SECRET)).toBeNull();
        expect(verifySupabaseJwt('xxx', SECRET)).toBeNull();
    });
});
