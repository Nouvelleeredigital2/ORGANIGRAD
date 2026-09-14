import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { registerCircuitRoutes } from '../src/api/circuitRoutes.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const humanId = '22222222-2222-4222-8222-222222222222';
const ids = {
    projectId: '33333333-3333-4333-8333-333333333333',
    ericId: '44444444-4444-4444-8444-444444444444',
    designId: '55555555-5555-4555-8555-555555555555',
    engineId: '66666666-6666-4666-8666-666666666666',
    guardianId: '77777777-7777-4777-8777-777777777777',
};

function sql(enabled = true, existing = false) {
    let worker = 0;
    const query = vi.fn((strings: TemplateStringsArray) => {
        const text = strings.join(' ').toLowerCase();
        if (text.includes('workspace_members')) return Promise.resolve([{ role: 'admin' }]);
        if (text.includes('from public.hybrid_nodes')) {
            worker += 1;
            return Promise.resolve([{ id: `worker-${worker}`, type: worker === 4 ? 'SOFTWARE_MCP' : 'AGENT_IA' }]);
        }
        if (text.includes('from public.bot_profiles')) return Promise.resolve([{ enabled }]);
        if (text.includes('from public.team_circuits') && text.includes("definition->>'name'")) return Promise.resolve(existing ? [{
            id: '88888888-8888-4888-8888-888888888888', version: 1, enabled: false,
            definition: { name: 'Boréal Production — parcours éditorial', project: { projectId: ids.projectId }, steps: [] },
        }] : []);
        if (text.includes('from public.projects')) return Promise.resolve([{ id: ids.projectId }]);
        if (text.includes('insert into public.team_circuits')) return Promise.resolve([{
            id: '88888888-8888-4888-8888-888888888888', version: 1, enabled: false,
            definition: { name: 'Boréal Production — parcours éditorial', project: { projectId: ids.projectId }, steps: [] },
        }]);
        return Promise.resolve([]);
    });
    Object.assign(query, {
        begin: vi.fn(async (callback: (tx: unknown) => unknown) => callback(query)),
        json: (value: unknown) => value,
    });
    return query as unknown as Sql;
}

describe('POST /api/circuits/boreal-production-template', () => {
    it('creates the governed seven-step template only when the three pilot bots are activated', async () => {
        const app = Fastify();
        app.addHook('onRequest', async req => { req.workspaceId = workspaceId; req.userId = humanId; });
        const database = sql(true);
        registerCircuitRoutes(app, { sql: database, appUrl: 'https://organigrad.example.test' });

        const response = await app.inject({ method: 'POST', url: '/api/circuits/boreal-production-template', payload: { ...ids, humanId } });

        expect(response.statusCode, response.body).toBe(201);
        expect(response.json().circuit.definition.name).toBe('Boréal Production — parcours éditorial');
        expect((database as unknown as ReturnType<typeof vi.fn>).mock.calls.some(call => String(call[0]).includes('bot_profiles'))).toBe(true);
        await app.close();
    });

    it('refuses to create the production circuit while a pilot persona remains a draft', async () => {
        const app = Fastify();
        app.addHook('onRequest', async req => { req.workspaceId = workspaceId; req.userId = humanId; });
        registerCircuitRoutes(app, { sql: sql(false), appUrl: 'https://organigrad.example.test' });

        const response = await app.inject({ method: 'POST', url: '/api/circuits/boreal-production-template', payload: { ...ids, humanId } });

        expect(response.statusCode, response.body).toBe(409);
        expect(response.json()).toMatchObject({ error: 'PILOT_BOT_NOT_ACTIVATED' });
        await app.close();
    });

    it('returns the existing production circuit instead of creating a duplicate after a lost response', async () => {
        const app = Fastify();
        app.addHook('onRequest', async req => { req.workspaceId = workspaceId; req.userId = humanId; });
        const database = sql(true, true);
        registerCircuitRoutes(app, { sql: database, appUrl: 'https://organigrad.example.test' });

        const response = await app.inject({ method: 'POST', url: '/api/circuits/boreal-production-template', payload: { ...ids, humanId } });

        expect(response.statusCode, response.body).toBe(200);
        expect((database as unknown as ReturnType<typeof vi.fn>).mock.calls.some(call => String(call[0]).includes('insert into public.team_circuits'))).toBe(false);
        await app.close();
    });
});
