import { describe, it, expect } from 'vitest';
import { createHmac, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { createSupabaseJwtVerifier } from '../src/api/userAuth.js';

/**
 * Vérificateur combiné HS256 + ES256 (JWKS). Les jetons de session des projets
 * Supabase migrés vers les « JWT signing keys » sont signés ES256 : sans ce
 * chemin, toute validation humaine échoue en 401 même avec le bon secret HS256.
 * Fetch injecté : aucun appel réseau réel.
 */

const SECRET = 'test-jwt-secret-please-change';
const future = Math.floor(Date.now() / 1000) + 3600;

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const { privateKey: otherPrivateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
const KID = 'kid-test-1';

function signEs256(
    payload: Record<string, unknown>,
    opts: { kid?: string; key?: typeof privateKey } = {},
): string {
    const h = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: opts.kid ?? KID }))
        .toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = cryptoSign(
        'sha256',
        Buffer.from(`${h}.${p}`),
        { key: opts.key ?? privateKey, dsaEncoding: 'ieee-p1363' },
    ).toString('base64url');
    return `${h}.${p}.${sig}`;
}

function signHs256(payload: Record<string, unknown>, secret = SECRET): string {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    return `${h}.${p}.${sig}`;
}

function jwksFetch(keys: unknown[], counter?: { calls: number }): typeof fetch {
    return (async () => {
        if (counter) counter.calls += 1;
        return {
            ok: true,
            status: 200,
            json: async () => ({ keys }),
        } as Response;
    }) as typeof fetch;
}

const GOOD_JWKS = [{ kty: 'EC', crv: 'P-256', kid: KID, x: jwk.x, y: jwk.y }];
const JWKS_URL = 'https://projet.supabase.co/auth/v1/.well-known/jwks.json';

describe('createSupabaseJwtVerifier — ES256 via JWKS', () => {
    it('accepte un JWT ES256 valide et renvoie sub/email', async () => {
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS),
        });
        const u = await verify(signEs256({ sub: 'user-1', email: 'a@b.fr', exp: future }));
        expect(u).toEqual({ sub: 'user-1', email: 'a@b.fr' });
    });

    it('rejette une signature ES256 invalide (autre clé privée)', async () => {
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS),
        });
        const forged = signEs256({ sub: 'user-1', exp: future }, { key: otherPrivateKey });
        expect(await verify(forged)).toBeNull();
    });

    it('rejette un token ES256 expiré', async () => {
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS),
        });
        const past = Math.floor(Date.now() / 1000) - 10;
        expect(await verify(signEs256({ sub: 'u', exp: past }))).toBeNull();
    });

    it('rejette un kid inconnu (après re-téléchargement du JWKS)', async () => {
        const counter = { calls: 0 };
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS, counter),
        });
        expect(await verify(signEs256({ sub: 'u', exp: future }, { kid: 'kid-inconnu' }))).toBeNull();
        expect(counter.calls).toBeGreaterThanOrEqual(1);
    });

    it('met le JWKS en cache entre deux vérifications', async () => {
        const counter = { calls: 0 };
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS, counter),
        });
        expect(await verify(signEs256({ sub: 'u1', exp: future }))).not.toBeNull();
        expect(await verify(signEs256({ sub: 'u2', exp: future }))).not.toBeNull();
        expect(counter.calls).toBe(1);
    });

    it('renvoie null (→ 401) si le téléchargement du JWKS échoue', async () => {
        const failingFetch = (async () => {
            throw new Error('réseau indisponible');
        }) as typeof fetch;
        const verify = createSupabaseJwtVerifier({ jwksUrl: JWKS_URL, fetchImpl: failingFetch });
        expect(await verify(signEs256({ sub: 'u', exp: future }))).toBeNull();
    });

    it('rejette ES256 quand aucune jwksUrl n’est configurée', async () => {
        const verify = createSupabaseJwtVerifier({ secret: SECRET });
        expect(await verify(signEs256({ sub: 'u', exp: future }))).toBeNull();
    });

    it('rejette un ES256 sans kid', async () => {
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS),
        });
        const h = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
        const p = Buffer.from(JSON.stringify({ sub: 'u', exp: future })).toString('base64url');
        const sig = cryptoSign('sha256', Buffer.from(`${h}.${p}`), {
            key: privateKey,
            dsaEncoding: 'ieee-p1363',
        }).toString('base64url');
        expect(await verify(`${h}.${p}.${sig}`)).toBeNull();
    });

    it('ignore les clés JWKS malformées sans casser les valides', async () => {
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch([
                { kty: 'RSA', kid: 'rsa-ignoree' },
                { kty: 'EC', crv: 'P-256', kid: 'sans-coords' },
                ...GOOD_JWKS,
            ]),
        });
        expect(await verify(signEs256({ sub: 'u', exp: future }))).not.toBeNull();
    });
});

describe('createSupabaseJwtVerifier — HS256 combiné', () => {
    it('accepte un HS256 valide quand le secret est configuré', async () => {
        const verify = createSupabaseJwtVerifier({
            secret: SECRET,
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS),
        });
        const u = await verify(signHs256({ sub: 'user-hs', exp: future }));
        expect(u).toEqual({ sub: 'user-hs', email: undefined });
    });

    it('rejette un HS256 quand seul le JWKS est configuré (pas de secret)', async () => {
        const verify = createSupabaseJwtVerifier({
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS),
        });
        expect(await verify(signHs256({ sub: 'u', exp: future }))).toBeNull();
    });

    it('rejette un token malformé', async () => {
        const verify = createSupabaseJwtVerifier({
            secret: SECRET,
            jwksUrl: JWKS_URL,
            fetchImpl: jwksFetch(GOOD_JWKS),
        });
        expect(await verify('pas-un-jwt')).toBeNull();
        expect(await verify('a.b')).toBeNull();
    });
});
