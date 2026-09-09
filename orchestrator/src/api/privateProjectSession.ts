import type { TransactionSql } from 'postgres';
import type { UserTokenVerifier } from './userAuth.js';

export class PrivateProjectError extends Error {
    constructor(readonly status: number, readonly code: string) { super(code); }
}
export const privateUuid = (value: unknown): value is string => typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export const unixSeconds = (value: unknown): value is number => typeof value === 'number' &&
    Number.isSafeInteger(value) && value > 0 && value <= 253402300799;
const unauthorized = () => new PrivateProjectError(401, 'PRIVATE_PROJECTS_UNAUTHORIZED');

export interface PrivateProjectSession { sub: string; sessionId: string; exp: number }

/** Signature verification MUST finish before any claims are interpreted as authority.
 * This strict contract is intentionally separate from the legacy JWT path.
 */
export async function privateProjectSession(token: string, issuer: string, verify: UserTokenVerifier): Promise<PrivateProjectSession> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw unauthorized();
        const user = await Promise.race([verify(token), new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(unauthorized()), 5000);
        })]);
        if (!user) throw unauthorized();
        const encoded = token.split('.')[1]!;
        const bytes = Buffer.from(encoded, 'base64url');
        if (bytes.toString('base64url') !== encoded) throw unauthorized();
        const claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
            claims.iss !== issuer || claims.aud !== 'authenticated' || claims.role !== 'authenticated' ||
            claims.is_anonymous !== false || !privateUuid(claims.sub) || claims.sub !== user.sub ||
            !privateUuid(claims.session_id) || !unixSeconds(claims.exp) || claims.exp <= Date.now() / 1000 ||
            (claims.nbf !== undefined && (!unixSeconds(claims.nbf) || claims.nbf > Date.now() / 1000))) throw unauthorized();
        return { sub: claims.sub, sessionId: claims.session_id, exp: claims.exp };
    } catch { throw unauthorized(); }
    finally { clearTimeout(timer); }
}

export async function privateReadTimeouts(tx: TransactionSql): Promise<void> {
    await tx`select set_config('statement_timeout','5s',true), set_config('lock_timeout','1s',true)`;
}

/** Every operation checks the current DB session and current account, without caching.
 * Null not_after means the issuer JWT still bounds this credential, not infinite access.
 */
export async function currentPrivateSession(tx: TransactionSql, session: PrivateProjectSession): Promise<number> {
    const rows = await tx<{ expires: string | number }[]>`
        select floor(least(${session.exp}::numeric,
            coalesce(extract(epoch from s.not_after), ${session.exp}::numeric))) as expires
        from auth.sessions s join auth.users u on u.id=s.user_id
        where s.id=${session.sessionId} and s.user_id=${session.sub}
          and s.created_at <= clock_timestamp()
          and u.is_anonymous=false and (u.banned_until is null or u.banned_until <= clock_timestamp())
          and (s.not_after is null or s.not_after > clock_timestamp())
          and ${session.exp}::numeric > extract(epoch from clock_timestamp())
        limit 1
    `;
    const expires = Number(rows[0]?.expires);
    if (!unixSeconds(expires) || expires <= Date.now() / 1000) throw unauthorized();
    return expires;
}

export async function currentPrivateProject(tx: TransactionSql, owner: string, workspace: string, project: string): Promise<void> {
    const rows = await tx`
        select p.id from public.projects p join public.workspace_members m on m.workspace_id=p.workspace_id
        where p.id=${project} and p.workspace_id=${workspace} and m.user_id=${owner}
          and m.role::text in ('owner','admin','member','viewer') limit 1
    `;
    if (!rows[0]) throw new PrivateProjectError(403, 'PRIVATE_PROJECTS_FORBIDDEN');
}
