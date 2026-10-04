import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerSuiteRoutes } from '../src/api/suiteRoutes.js';

const USER = '33333333-3333-4333-8333-333333333333';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const PROJECT = '11111111-1111-4111-8111-111111111111';

function app() {
    const server = Fastify();
    server.decorateRequest('userId', undefined);
    server.decorateRequest('workspaceId', undefined);
    server.addHook('onRequest', async request => {
        if (request.headers.authorization === 'Bearer human') {
            request.userId = USER; request.workspaceId = WORKSPACE;
        }
    });
    const service = { open: vi.fn(async () => ({ projectId: PROJECT, workspaceId: WORKSPACE, redirect: '/?v=projects' })) };
    const native = { prepare: vi.fn(async () => ({ state: 'ready' as const, nativeRef: { nativeWorkspaceId: WORKSPACE, nativeProjectId: PROJECT, canonicalUrl: 'https://organigrad.example/' }, receipt: 'r' })), lookup: vi.fn(), grant: vi.fn(async () => ({ state: 'granted' as const, receipt: 'g' })), revoke: vi.fn(), open: vi.fn() };
    registerSuiteRoutes(server, { service, native, serviceCredential: 'machine-credential-32-characters' });
    return { server, service, native };
}

describe('routes suite Synapse', () => {
    it('ouvre un projet uniquement pour une session humaine et son workspace', async () => {
        const { server, service } = app(); await server.ready();
        const denied = await server.inject({ method: 'POST', url: '/api/synapse/suite/launch', payload: { code: 'A'.repeat(43) } });
        expect(denied.statusCode).toBe(401);
        const ok = await server.inject({ method: 'POST', url: '/api/synapse/suite/launch', headers: { authorization: 'Bearer human' }, payload: { code: 'A'.repeat(43) } });
        expect(ok.statusCode).toBe(200);
        expect(service.open).toHaveBeenCalledWith('A'.repeat(43), { userId: USER, workspaceId: WORKSPACE });
        await server.close();
    });

    it('réserve prepare/grant/revoke au secret machine et force no-store', async () => {
        const { server, native } = app(); await server.ready();
        const denied = await server.inject({ method: 'GET', url: '/api/synapse/suite/spaces/key' });
        expect(denied.statusCode).toBe(401);
        const auth = { authorization: 'Bearer machine-credential-32-characters' };
        const missing = await server.inject({ method: 'GET', url: '/api/synapse/suite/spaces/key', headers: auth });
        expect(missing.statusCode).toBe(404);
        expect(missing.headers['cache-control']).toBe('private, no-store');
        expect(native.lookup).toHaveBeenCalledWith('key');
        await server.close();
    });
});
