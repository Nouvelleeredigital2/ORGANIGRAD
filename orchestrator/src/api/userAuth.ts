import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';

/**
 * Vérification d'un JWT utilisateur Supabase — Phase 2 (validation humaine).
 * Sans dépendance, deux chemins :
 *   - HS256 : signature HMAC-SHA256 avec le secret partagé du projet
 *     (`SUPABASE_JWT_SECRET`, projets « legacy »).
 *   - ES256 : signature ECDSA P-256 vérifiée contre les clés publiques du
 *     projet (`SUPABASE_JWKS_URL`, projets migrés vers les « JWT signing
 *     keys » — les jetons de session n'y sont PLUS signés HS256).
 * Renvoie le sujet (`sub` = user id) si valide, sinon `null`.
 *
 * Le secret (`SUPABASE_JWT_SECRET`) ne doit jamais être journalisé.
 */

export interface VerifiedUser {
    sub: string;
    email?: string;
}

function b64urlToBuffer(s: string): Buffer {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

function parseHeader(headerB64: string): { alg?: unknown; kid?: unknown } | null {
    try {
        return JSON.parse(b64urlToBuffer(headerB64).toString('utf8'));
    } catch {
        return null;
    }
}

function readVerifiedPayload(payloadB64: string, now: () => number): VerifiedUser | null {
    let payload: { sub?: unknown; email?: unknown; exp?: unknown };
    try {
        payload = JSON.parse(b64urlToBuffer(payloadB64).toString('utf8'));
    } catch {
        return null;
    }
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= now()) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
    };
}

export function verifySupabaseJwt(
    token: string,
    secret: string,
    now: () => number = () => Date.now(),
): VerifiedUser | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    const header = parseHeader(headerB64);
    if (!header || header.alg !== 'HS256') return null;

    const expected = createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
    if (!safeEqual(expected, signatureB64)) return null;

    return readVerifiedPayload(payloadB64, now);
}

interface JwkEcPublic {
    kty?: unknown;
    crv?: unknown;
    kid?: unknown;
    x?: unknown;
    y?: unknown;
}

export interface JwtVerifierOptions {
    /** Secret HS256 partagé (projets legacy). */
    secret?: string;
    /**
     * URL JWKS du projet (`https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`).
     * Active la vérification ES256 des jetons signés par les « JWT signing keys ».
     * URL de confiance fournie par l'opérateur — pas un input utilisateur.
     */
    jwksUrl?: string;
    /** Fetch injectable (tests hermétiques). */
    fetchImpl?: typeof fetch;
    now?: () => number;
    /** Durée de cache du JWKS avant re-téléchargement (défaut 10 min). */
    cacheTtlMs?: number;
}

export type UserTokenVerifier = (token: string) => Promise<VerifiedUser | null>;

/**
 * Construit un vérificateur de session utilisateur couvrant HS256 (secret
 * partagé) et ES256 (JWKS). Le JWKS est mis en cache ; un `kid` inconnu
 * déclenche un re-téléchargement (rotation de clés), au plus une fois par
 * minute pour ne pas marteler l'endpoint sur des jetons forgés.
 */
export function createSupabaseJwtVerifier(opts: JwtVerifierOptions): UserTokenVerifier {
    const now = opts.now ?? (() => Date.now());
    const cacheTtlMs = opts.cacheTtlMs ?? 10 * 60 * 1000;
    const doFetch = opts.fetchImpl ?? fetch;

    let keys: Map<string, ReturnType<typeof createPublicKey>> = new Map();
    let fetchedAt = 0;

    async function loadJwks(force: boolean): Promise<void> {
        if (!opts.jwksUrl) return;
        const age = now() - fetchedAt;
        if (!force && keys.size > 0 && age < cacheTtlMs) return;
        if (force && fetchedAt !== 0 && age < 60_000) return;
        const res = await doFetch(opts.jwksUrl);
        if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
        const body = (await res.json()) as { keys?: JwkEcPublic[] };
        const next = new Map<string, ReturnType<typeof createPublicKey>>();
        for (const k of body.keys ?? []) {
            if (k.kty !== 'EC' || k.crv !== 'P-256') continue;
            if (typeof k.kid !== 'string' || typeof k.x !== 'string' || typeof k.y !== 'string') {
                continue;
            }
            try {
                next.set(
                    k.kid,
                    createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }, format: 'jwk' }),
                );
            } catch {
                // Clé malformée : ignorée, les autres restent utilisables.
            }
        }
        keys = next;
        fetchedAt = now();
    }

    return async function verifyUserToken(token: string): Promise<VerifiedUser | null> {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

        const header = parseHeader(headerB64);
        if (!header) return null;

        if (header.alg === 'HS256') {
            return opts.secret ? verifySupabaseJwt(token, opts.secret, now) : null;
        }

        if (header.alg !== 'ES256' || !opts.jwksUrl) return null;
        if (typeof header.kid !== 'string' || header.kid.length === 0) return null;

        try {
            await loadJwks(false);
            if (!keys.has(header.kid)) {
                await loadJwks(true);
            }
        } catch {
            return null;
        }
        const key = keys.get(header.kid);
        if (!key) return null;

        const signature = b64urlToBuffer(signatureB64);
        // ES256 : signature JOSE brute r||s (64 octets), pas DER.
        const valid = cryptoVerify(
            'sha256',
            Buffer.from(`${headerB64}.${payloadB64}`),
            { key, dsaEncoding: 'ieee-p1363' },
            signature,
        );
        if (!valid) return null;

        return readVerifiedPayload(payloadB64, now);
    };
}
