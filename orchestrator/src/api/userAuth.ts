import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Vérification d'un JWT utilisateur Supabase (HS256) — Phase 2 (validation
 * humaine). Sans dépendance : vérifie l'algorithme, la signature HMAC-SHA256 sur
 * `header.payload` avec le secret JWT du projet, et l'expiration. Renvoie le
 * sujet (`sub` = user id) si valide, sinon `null`.
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

export function verifySupabaseJwt(
    token: string,
    secret: string,
    now: () => number = () => Date.now(),
): VerifiedUser | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    let header: { alg?: unknown; typ?: unknown };
    try {
        header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8'));
    } catch {
        return null;
    }
    if (header.alg !== 'HS256') return null;

    const expected = createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
    if (!safeEqual(expected, signatureB64)) return null;

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
