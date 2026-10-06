import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SuiteLaunchError, parseGrantCommand, parsePrepareCommand, type SuiteNativeStore } from '../synapse/suiteLaunch.js';

interface LaunchService {
    open(code: string, actor: { userId: string; workspaceId: string }): Promise<{ projectId: string; workspaceId: string; redirect: string }>;
}

export interface SuiteRouteDeps {
    service: LaunchService;
    native: SuiteNativeStore;
    serviceCredential: string;
}

export function isSuiteMachinePath(path: string): boolean {
    return path.startsWith('/api/synapse/suite/spaces');
}

function machineAuthorized(request: FastifyRequest, expected: string): boolean {
    const presented = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
    const a = Buffer.from(presented), b = Buffer.from(expected);
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function error(reply: FastifyReply, caught: unknown) {
    if (caught instanceof SuiteLaunchError) return reply.code(caught.status).send({ error: caught.code });
    return reply.code(500).send({ error: 'SYNAPSE_SUITE_FAILED' });
}

export function registerSuiteRoutes(app: FastifyInstance, deps: SuiteRouteDeps) {
    app.post('/api/synapse/suite/launch', async (request, reply) => {
        reply.header('Cache-Control', 'private, no-store');
        if (!request.userId || !request.workspaceId) return reply.code(401).send({ error: 'HUMAN_SESSION_REQUIRED' });
        const code = (request.body as { code?: unknown } | null)?.code;
        if (typeof code !== 'string') return reply.code(400).send({ error: 'SYNAPSE_CODE_INVALID' });
        try { return await deps.service.open(code, { userId: request.userId, workspaceId: request.workspaceId }); }
        catch (caught) { return error(reply, caught); }
    });

    app.addHook('preHandler', async (request, reply) => {
        if (!isSuiteMachinePath(request.url.split('?')[0]!)) return;
        reply.header('Cache-Control', 'private, no-store');
        if (!machineAuthorized(request, deps.serviceCredential)) return reply.code(401).send({ error: 'INVALID_SERVICE_CREDENTIAL' });
    });

    app.post('/api/synapse/suite/spaces', async (request, reply) => {
        try { return await deps.native.prepare(parsePrepareCommand(request.body)); }
        catch (caught) { return error(reply, caught); }
    });
    app.get<{ Params: { key: string } }>('/api/synapse/suite/spaces/:key', async (request, reply) => {
        try {
            const found = await deps.native.lookup(request.params.key);
            return found ?? reply.code(404).send({ error: 'NATIVE_SPACE_NOT_FOUND' });
        } catch (caught) { return error(reply, caught); }
    });
    app.post<{ Params: { key: string } }>('/api/synapse/suite/spaces/:key/grants', async (request, reply) => {
        try {
            const command = parseGrantCommand(request.body);
            if (command.idempotencyKey !== request.params.key) return reply.code(409).send({ error: 'IDEMPOTENCY_KEY_MISMATCH' });
            return await deps.native.grant(command);
        } catch (caught) { return error(reply, caught); }
    });
    app.delete<{ Params: { key: string; nativeAccountId: string } }>('/api/synapse/suite/spaces/:key/grants/:nativeAccountId', async (request, reply) => {
        try { await deps.native.revoke(request.params.key, request.params.nativeAccountId); return reply.code(204).send(); }
        catch (caught) { return error(reply, caught); }
    });
}
