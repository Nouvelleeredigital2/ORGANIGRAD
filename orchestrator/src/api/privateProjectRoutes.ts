import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Sql, TransactionSql } from 'postgres';
import type { UserTokenVerifier } from './userAuth.js';
import { readProjectContext } from './projectRoutes.js';
import { currentPrivateProject, currentPrivateSession, privateProjectSession, privateReadTimeouts,
    privateUuid, unixSeconds, PrivateProjectError } from './privateProjectSession.js';

const ROOT = '/api/private-projects';
const READ = 'isolation level repeatable read read only';
const WRITE = 'isolation level repeatable read';
const PREFIX = 'ogp_';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => new PrivateProjectError(400, 'PRIVATE_PROJECTS_INVALID_REQUEST');
const unauthorized = () => new PrivateProjectError(401, 'PRIVATE_PROJECTS_UNAUTHORIZED');
export const isPrivateProjectPath = (path: string) => path === ROOT || path.startsWith(`${ROOT}/`);
export function isPrivateProjectRoute(req: FastifyRequest): boolean {
    const path = req.routeOptions.url;
    return ((req.method === 'GET' || req.method === 'HEAD') &&
        [ROOT + '/tokens', ROOT + '/introspect', ROOT + '/context'].includes(path ?? '')) ||
        (req.method === 'POST' && path === ROOT + '/tokens') ||
        (req.method === 'DELETE' && path === ROOT + '/tokens/:tokenId');
}
export interface PrivateProjectDeps {
    sql: Sql;
    issuer: string;
    verifyUserToken: UserTokenVerifier;
    allowedOrigins: readonly string[];
}
export function validPrivateIssuer(issuer: string): boolean {
    try { const url = new URL(issuer); return url.protocol === 'https:' && !url.username && !url.password &&
        !url.port && issuer === `${url.origin}/auth/v1`; } catch { return false; }
}
export function validPrivateOrigin(origin: string): boolean {
    try { const url = new URL(origin); return url.protocol === 'https:' && origin === url.origin; } catch { return false; }
}
function bearer(req: FastifyRequest): string {
    const value = req.headers.authorization;
    if (!value || value.length > 8200 || !/^Bearer [^\s]+$/.test(value)) throw unauthorized();
    return value.slice(7);
}
function workspace(req: FastifyRequest): string {
    const value = req.headers['x-workspace-id'];
    if (!privateUuid(value)) throw invalid();
    return value;
}
function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some(key => !allowed.includes(key))) throw invalid();
    return value as Record<string, unknown>;
}
function emptyQuery(req: FastifyRequest): void { object(req.query, []); }

interface Credential {
    id: string; owner_id: string; workspace_id: string; project_id: string; session_id: string;
    expires_at: string | number; issuer_expires_at: string | number; scopes: string[];
}
async function credential(tx: TransactionSql, raw: string): Promise<Credential & { expiresAt: number }> {
    if (!/^ogp_[0-9a-f]{64}$/.test(raw)) throw unauthorized();
    const rows = await tx<Credential[]>`
        select id,owner_id,workspace_id,project_id,session_id,expires_at,issuer_expires_at,scopes
        from public.personal_project_tokens where token_hash=${hash(raw)} and revoked_at is null
          and expires_at > extract(epoch from clock_timestamp()) limit 1
    `;
    const row = rows[0];
    if (!row || ![row.id,row.owner_id,row.workspace_id,row.project_id,row.session_id].every(privateUuid) ||
        !Array.isArray(row.scopes) || row.scopes.length !== 1 || row.scopes[0] !== 'projects:read' ||
        !unixSeconds(Number(row.expires_at)) || !unixSeconds(Number(row.issuer_expires_at)) ||
        Number(row.expires_at) > Number(row.issuer_expires_at)) throw unauthorized();
    const sessionExpiry = await currentPrivateSession(tx, { sub: row.owner_id, sessionId: row.session_id, exp: Number(row.issuer_expires_at) });
    try { await currentPrivateProject(tx, row.owner_id, row.workspace_id, row.project_id); }
    catch (error) { if (error instanceof PrivateProjectError && error.status === 403) throw unauthorized(); throw error; }
    const expiresAt = Math.min(Number(row.expires_at), sessionExpiry);
    if (expiresAt <= Date.now() / 1000) throw unauthorized();
    return { ...row, expiresAt };
}

/** Dedicated principal and namespace: never sets legacy req.userId/scopes/apiKeyId. */
export function registerPrivateProjectRoutes(app: FastifyInstance, deps: PrivateProjectDeps): void {
    if (!validPrivateIssuer(deps.issuer) || typeof deps.verifyUserToken !== 'function' ||
        !deps.allowedOrigins.length || !deps.allowedOrigins.every(validPrivateOrigin)) {
        throw new Error('PRIVATE_PROJECTS_CONFIGURATION_INVALID');
    }
    const origins = new Set(deps.allowedOrigins);
    // Fixed process-wide budgets have bounded memory even under arbitrary forged tokens/IPs.
    let window = 0, requests = 0, mutations = 0;
    void app.register(async routes => {
        routes.setErrorHandler((error, _req, reply) => {
            reply.header('Cache-Control', 'private, no-store');
            if (error instanceof PrivateProjectError) return reply.code(error.status).send({ error: error.code });
            const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
            const clientStatus = typeof status === 'number' && [400,413,415].includes(status) ? status : 503;
            return reply.code(clientStatus).send({ error: clientStatus === 503 ? 'PRIVATE_PROJECTS_UNAVAILABLE' : 'PRIVATE_PROJECTS_INVALID_REQUEST' });
        });
        routes.addHook('onRequest', async (req, reply) => {
            reply.header('Cache-Control', 'private, no-store');
            const now = Date.now();
            if (now - window >= 60_000) { window = now; requests = 0; mutations = 0; }
            const mutation = req.method === 'POST' || req.method === 'DELETE';
            if (++requests > 600 || (mutation && ++mutations > 60)) {
                reply.header('Retry-After', '60');
                throw new PrivateProjectError(429, 'PRIVATE_PROJECTS_RATE_LIMITED');
            }
            if (req.url.length > 1024) throw invalid();
            if (mutation && (!req.headers.origin || !origins.has(req.headers.origin))) {
                throw new PrivateProjectError(403, 'PRIVATE_PROJECTS_ORIGIN_DENIED');
            }
        });

        routes.post(ROOT + '/tokens', { bodyLimit: 2048 }, async (req, reply) => {
            emptyQuery(req);
            const session = await privateProjectSession(bearer(req), deps.issuer, deps.verifyUserToken);
            const ws = workspace(req);
            const body = object(req.body, ['projectId','name','expiresAt']);
            if (!privateUuid(body.projectId) || typeof body.name !== 'string' || body.name.length > 80 ||
                !body.name.trim() || [...body.name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !unixSeconds(body.expiresAt) ||
                body.expiresAt <= Date.now() / 1000) throw invalid();
            const projectId = body.projectId, name = body.name.trim(), requestedExpiry = body.expiresAt;
            const result = await deps.sql.begin(WRITE, async tx => {
                await privateReadTimeouts(tx);
                const expiresAt = Math.min(requestedExpiry, await currentPrivateSession(tx, session));
                await currentPrivateProject(tx, session.sub, ws, projectId);
                const token = PREFIX + randomBytes(32).toString('hex');
                const rows = await tx<{ id: string }[]>`
                    insert into public.personal_project_tokens(owner_id,workspace_id,project_id,session_id,
                        name,token_hash,token_prefix,issuer_expires_at,expires_at)
                    values (${session.sub},${ws},${projectId},${session.sessionId},${name},${hash(token)},
                        ${token.slice(0,12)},${session.exp},${expiresAt}) returning id
                `;
                if (!privateUuid(rows[0]?.id)) throw new Error('Invalid credential result');
                return { id: rows[0].id, token, workspace: ws, projectId, scopes: ['projects:read'], expiresAt };
            });
            return reply.code(201).send(result);
        });

        routes.get(ROOT + '/tokens', async req => {
            const session = await privateProjectSession(bearer(req), deps.issuer, deps.verifyUserToken);
            const ws = workspace(req), query = object(req.query, ['projectId','cursor']);
            if (!privateUuid(query.projectId) || (query.cursor !== undefined && !privateUuid(query.cursor))) throw invalid();
            const project = query.projectId, cursor = query.cursor as string | undefined;
            return deps.sql.begin(READ, async tx => {
                await privateReadTimeouts(tx);
                await currentPrivateSession(tx, session);
                await currentPrivateProject(tx, session.sub, ws, project);
                const rows = await tx<Record<string, unknown>[]>`
                    select t.id,t.name,t.token_prefix,t.expires_at,t.created_at,t.revoked_at
                    from public.personal_project_tokens t join auth.sessions s on s.id=t.session_id and s.user_id=t.owner_id
                    where t.owner_id=${session.sub} and t.workspace_id=${ws} and t.project_id=${project}
                      and s.created_at <= clock_timestamp() and (s.not_after is null or s.not_after > clock_timestamp())
                      and (${cursor ?? null}::uuid is null or t.id > ${cursor ?? null}::uuid)
                    order by t.id limit 101
                `;
                const tokens = rows.slice(0,100).map(row => ({ id: row.id, name: row.name, prefix: row.token_prefix,
                    expiresAt: Number(row.expires_at), createdAt: row.created_at, revokedAt: row.revoked_at }));
                return { tokens, ...(rows.length > 100 ? { nextCursor: tokens.at(-1)!.id } : {}) };
            });
        });

        routes.delete<{ Params: { tokenId: string } }>(ROOT + '/tokens/:tokenId', { bodyLimit: 2048 }, async (req, reply) => {
            emptyQuery(req);
            if (req.body !== undefined) throw invalid();
            const session = await privateProjectSession(bearer(req), deps.issuer, deps.verifyUserToken);
            const ws = workspace(req), id = req.params.tokenId;
            if (!privateUuid(id)) throw invalid();
            await deps.sql.begin(WRITE, async tx => {
                await privateReadTimeouts(tx);
                await currentPrivateSession(tx, session);
                // Current membership is checked even if the target is absent.
                const members = await tx`select role from public.workspace_members where workspace_id=${ws}
                    and user_id=${session.sub} and role::text in ('owner','admin','member','viewer') limit 1`;
                if (!members[0]) throw new PrivateProjectError(403, 'PRIVATE_PROJECTS_FORBIDDEN');
                const rows = await tx<{ project_id: string }[]>`
                    select t.project_id from public.personal_project_tokens t
                    join auth.sessions s on s.id=t.session_id and s.user_id=t.owner_id
                    where t.id=${id} and t.owner_id=${session.sub} and t.workspace_id=${ws}
                      and s.created_at <= clock_timestamp() and (s.not_after is null or s.not_after > clock_timestamp()) limit 1
                `;
                if (!rows[0]) throw new PrivateProjectError(404, 'PRIVATE_PROJECTS_NOT_FOUND');
                await currentPrivateProject(tx, session.sub, ws, rows[0].project_id);
                await tx`update public.personal_project_tokens set revoked_at=coalesce(revoked_at,clock_timestamp())
                    where id=${id} and owner_id=${session.sub} and workspace_id=${ws}`;
            });
            return reply.code(204).send();
        });

        for (const action of ['introspect','context'] as const) {
            routes.get(`${ROOT}/${action}`, async req => {
                emptyQuery(req);
                // Introspection does not receive workspace/project selectors from Synapse.
                if (req.headers['x-workspace-id'] !== undefined) throw invalid();
                const token = bearer(req);
                if (!/^ogp_[0-9a-f]{64}$/.test(token)) throw unauthorized();
                return deps.sql.begin(READ, async tx => {
                    await privateReadTimeouts(tx);
                    const row = await credential(tx, token);
                    const result = action === 'introspect'
                        ? { active: true, appId: 'organigrad', subject: row.owner_id, workspace: row.workspace_id,
                            projectId: row.project_id, scopes: ['projects:read'], expiresAt: row.expiresAt }
                        : await readProjectContext(tx, row.workspace_id, row.project_id);
                    if (row.expiresAt <= Date.now() / 1000) throw unauthorized();
                    return result;
                });
            });
        }
    });
}
