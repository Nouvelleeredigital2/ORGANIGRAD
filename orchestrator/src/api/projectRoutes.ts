import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Sql, TransactionSql } from 'postgres';
import { buildAuthHook, type AuthDeps } from './auth.js';
import { hasScope, SCOPES, scopesForRole } from './scopes.js';
import { verifySupabaseJwt } from './userAuth.js';

const LIST_PATH = '/api/projects';
const CONTEXT_PATH = '/api/projects/:projectId/context';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_ACTIVITY = 10;

class ProjectReadError extends Error {
    constructor(readonly status: number, readonly code: string) { super(code); }
}

/** Match registered route templates, never a user-controlled URL prefix. */
export function isProjectReadRoute(req: FastifyRequest): boolean {
    return (req.method === 'GET' || req.method === 'HEAD') &&
        (req.routeOptions.url === LIST_PATH || req.routeOptions.url === CONTEXT_PATH);
}

function uuid(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value);
}

function boundedText(value: unknown, max: number): string {
    if (typeof value !== 'string') throw new Error('Invalid project text');
    // Match PostgreSQL left(text, n): code points, with bounded intermediate work.
    return Array.from(value.slice(0, max * 2)).slice(0, max).join('');
}

function integer(value: unknown): number {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
        throw new Error('Invalid count');
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid count');
    return number;
}

function timestamp(value: unknown): string {
    const text = value instanceof Date ? value.toISOString() : value;
    if (typeof text !== 'string' || text.length > 40 || !Number.isFinite(Date.parse(text))) {
        throw new Error('Invalid timestamp');
    }
    return text;
}

function safeProject(row: Record<string, unknown>, workspaceId: string) {
    if (!uuid(row.id) || row.workspace_id !== workspaceId) throw new Error('Invalid project scope');
    const version = integer(row.version);
    if (version < 1) throw new Error('Invalid project version');
    return {
        id: row.id, workspace_id: workspaceId,
        name: boundedText(row.name, 160), description: boundedText(row.description, 500),
        archived_at: row.archived_at === null ? null : timestamp(row.archived_at),
        created_at: timestamp(row.created_at), updated_at: timestamp(row.updated_at), version,
    };
}

function safeActivity(row: Record<string, unknown>) {
    if (!uuid(row.id) || !['todo', 'running', 'blocked', 'done'].includes(String(row.status))) {
        throw new Error('Invalid task activity');
    }
    return {
        id: row.id, title: boundedText(row.title, 200), status: row.status as string,
        updated_at: timestamp(row.updated_at),
        archived_at: row.archived_at === null ? null : timestamp(row.archived_at),
    };
}

type Cursor = { workspaceId: string; updatedAt: string; id: string };

function pagination(query: Record<string, unknown>, workspaceId: string) {
    const invalid = () => new ProjectReadError(400, 'INVALID_PROJECT_QUERY');
    if (Object.keys(query).some(key => key !== 'limit' && key !== 'cursor')) throw invalid();
    const rawLimit = query.limit;
    if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^[1-9]\d{0,2}$/.test(rawLimit))) {
        throw invalid();
    }
    const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
    if (limit > MAX_LIMIT) throw invalid();
    let cursor: Cursor | undefined;
    if (query.cursor !== undefined) {
        const raw = query.cursor;
        if (typeof raw !== 'string' || raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw invalid();
        try {
            const decoded = Buffer.from(raw, 'base64url');
            if (decoded.toString('base64url') !== raw) throw invalid();
            const value = JSON.parse(decoded.toString('utf8')) as Cursor;
            if (!value || Object.keys(value).sort().join(',') !== 'id,updatedAt,workspaceId' ||
                value.workspaceId !== workspaceId || !uuid(value.id) ||
                typeof value.updatedAt !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.updatedAt) ||
                new Date(value.updatedAt).toISOString() !== `${value.updatedAt.slice(0, 23)}Z`) throw invalid();
            cursor = value;
        } catch { throw invalid(); }
    }
    return { limit, cursor };
}

async function readTimeouts(tx: TransactionSql) {
    // Transaction-local constants: never change pooled connection defaults or
    // accept a caller-provided timeout. Bound both scans and lock acquisition.
    await tx`
        select set_config('statement_timeout', '5s', true), set_config('lock_timeout', '1s', true)
    `;
}

async function currentMember(tx: TransactionSql, workspaceId: string, userId: string) {
    await readTimeouts(tx);
    const rows = await tx<{ role: string }[]>`
        select role from public.workspace_members
        where workspace_id = ${workspaceId} and user_id = ${userId}
        limit 1
    `;
    if (!rows[0]) throw new ProjectReadError(403, 'NOT_A_WORKSPACE_MEMBER');
    if (!hasScope(scopesForRole(rows[0].role), SCOPES.graphRead)) {
        throw new ProjectReadError(403, 'INSUFFICIENT_SCOPE');
    }
}

/** Product reads only. No writes, outbound calls, profile joins or LINK binding. */
export function registerProjectRoutes(app: FastifyInstance, deps: AuthDeps): void {
    void app.register(async routes => {
        const verifyUser = deps.verifyUserToken ?? (deps.jwtSecret
            ? async (token: string) => verifySupabaseJwt(token, deps.jwtSecret!)
            : undefined);
        // buildAuthHook only needs the SQL tag for its membership lookup here.
        // Wrap that lookup too: its signature/expiry verification still runs
        // before any SQL, and technical keys are rejected before invoking auth.
        const authSql = (async (strings: TemplateStringsArray, ...values: string[]) =>
            deps.sql.begin('isolation level repeatable read read only', async tx => {
                await readTimeouts(tx);
                return tx(strings, ...values);
            })) as unknown as Sql;
        const auth = buildAuthHook({
            sql: authSql,
            verifyUserToken: async token => {
                const user = await verifyUser?.(token);
                if (user && !uuid(user.sub)) throw new ProjectReadError(400, 'INVALID_USER_ID');
                return user ?? null;
            },
        });

        routes.setErrorHandler((error, _req, reply) => {
            reply.header('Cache-Control', 'private, no-store');
            if (error instanceof ProjectReadError) {
                return reply.code(error.status).send({ error: error.code });
            }
            return reply.code(503).send({ error: 'PROJECTS_UNAVAILABLE' });
        });

        routes.addHook('onRequest', async (req, reply) => {
            reply.header('Cache-Control', 'private, no-store');
            const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
            if (!bearer) throw new ProjectReadError(401, 'MISSING_BEARER_TOKEN');
            if (bearer?.startsWith('ok_')) throw new ProjectReadError(403, 'USER_SESSION_REQUIRED');
            const workspace = req.headers['x-workspace-id'];
            if (!uuid(typeof workspace === 'string' ? workspace.trim() : workspace)) {
                throw new ProjectReadError(400, 'INVALID_WORKSPACE_ID');
            }
            await auth(req, reply);
            if (reply.sent) return;
            if (!req.userId || !req.workspaceId || req.apiKeyId) {
                throw new ProjectReadError(403, 'USER_SESSION_REQUIRED');
            }
            if (!hasScope(req.scopes, SCOPES.graphRead)) throw new ProjectReadError(403, 'INSUFFICIENT_SCOPE');
            // PostgreSQL UUID equality is case-insensitive; keep cursors/DTOs canonical.
            req.workspaceId = req.workspaceId.toLowerCase();
        });

        routes.get(LIST_PATH, async req => {
            const workspaceId = req.workspaceId!;
            const { limit, cursor } = pagination(req.query as Record<string, unknown>, workspaceId);
            return deps.sql.begin('isolation level repeatable read read only', async tx => {
                await currentMember(tx, workspaceId, req.userId!);
                // Include archived projects: this read API also supports consulting them.
                // Format updated_at in SQL to preserve microseconds through the cursor;
                // the driver's JS Date conversion would lose the final three digits.
                const rows = await tx<Record<string, unknown>[]>`
                    select id, workspace_id, left(name, 160) as name, left(description, 500) as description,
                           archived_at, created_at,
                           to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at,
                           version
                    from public.projects
                    where workspace_id = ${workspaceId}
                      and (${cursor?.updatedAt ?? null}::timestamptz is null
                           or (updated_at, id) < (${cursor?.updatedAt ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
                    order by public.projects.updated_at desc, id desc
                    limit ${limit + 1}
                `;
                const projects = rows.slice(0, limit).map(row => safeProject(row, workspaceId));
                const last = projects.at(-1);
                const nextCursor = rows.length > limit && last
                    ? Buffer.from(JSON.stringify({ workspaceId, updatedAt: last.updated_at, id: last.id })).toString('base64url')
                    : undefined;
                return { projects, ...(nextCursor ? { nextCursor } : {}) };
            });
        });

        routes.get<{ Params: { projectId: string } }>(CONTEXT_PATH, async req => {
            const { projectId } = req.params;
            if (!uuid(projectId)) throw new ProjectReadError(400, 'INVALID_PROJECT_ID');
            if (Object.keys(req.query as object).length) throw new ProjectReadError(400, 'INVALID_PROJECT_QUERY');
            const workspaceId = req.workspaceId!;
            return deps.sql.begin('isolation level repeatable read read only', async tx => {
                await currentMember(tx, workspaceId, req.userId!);
                const projects = await tx<Record<string, unknown>[]>`
                    select id, workspace_id, left(name, 160) as name, left(description, 500) as description,
                           archived_at, created_at,
                           to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at,
                           version
                    from public.projects
                    where workspace_id = ${workspaceId} and id = ${projectId}
                    limit 1
                `;
                if (!projects[0]) throw new ProjectReadError(404, 'PROJECT_NOT_FOUND');
                const project = safeProject(projects[0], workspaceId);
                const summaries = await tx<Record<string, unknown>[]>`
                    select count(*) as total,
                           count(*) filter (where status = 'done') as done,
                           count(*) filter (where status = 'running') as running,
                           count(*) filter (where status = 'blocked') as blocked
                    from public.project_tasks
                    where workspace_id = ${workspaceId} and project_id = ${projectId} and archived_at is null
                `;
                const summary = summaries[0];
                const taskSummary = {
                    total: integer(summary?.total), done: integer(summary?.done),
                    running: integer(summary?.running), blocked: integer(summary?.blocked),
                };
                const members = await tx<{ count: unknown }[]>`
                    select count(*) as count from public.workspace_members where workspace_id = ${workspaceId}
                `;
                const workspaceMemberCount = integer(members[0]?.count);
                // These are the latest real task rows, not a fabricated event/audit log.
                // Include archive updates, but exclude archived tasks from counters above.
                const activity = await tx<Record<string, unknown>[]>`
                    select id, left(title, 200) as title, status, updated_at, archived_at
                    from public.project_tasks
                    where workspace_id = ${workspaceId} and project_id = ${projectId}
                    order by updated_at desc, id desc
                    limit 10
                `;
                return { project, taskSummary, workspaceMemberCount,
                    recentActivity: activity.slice(0, MAX_ACTIVITY).map(safeActivity) };
            });
        });
    });
}
