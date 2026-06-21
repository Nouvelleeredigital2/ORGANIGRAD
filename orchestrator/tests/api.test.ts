import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import type { HybridNode } from '../src/domain/types.js';
import { InMemoryGraphStore } from '../src/state/graphStore.js';
import { OrchestrationEngine } from '../src/orchestration/engine.js';

const SEED: HybridNode[] = [
    {
        id: 'red',
        type: 'AGENT_IA',
        nom: 'R',
        roleTitre: 'r',
        parentID: null,
        gradeId: 'E',
        mcpConfig: { serverUrl: 'mcp://red', connectedTo: [] },
        status: 'IDLE',
    },
    {
        id: 'hum',
        type: 'HUMAN',
        nom: 'H',
        roleTitre: 'h',
        parentID: 'red',
        gradeId: 'D',
        status: 'IDLE',
    },
];

function makeApp() {
    const store = new InMemoryGraphStore();
    store.load(SEED);
    const mcp = { runNode: async () => ({ ok: true as const, output: null }) };
    const engine = new OrchestrationEngine(store, mcp);
    return { app: buildServer({ store, engine }), store, engine };
}

describe('API REST + SSE', () => {
    let app: FastifyInstance;
    let store: InMemoryGraphStore;
    let engine: OrchestrationEngine;

    beforeEach(() => {
        const made = makeApp();
        app = made.app;
        store = made.store;
        engine = made.engine;
    });

    afterEach(async () => {
        await app.close();
    });

    it('GET /api/graph renvoie le graphe (DTO public)', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/graph' });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.nodes).toHaveLength(2);
        expect(body.nodes.map((n: { id: string }) => n.id)).toEqual(['red', 'hum']);
    });

    it('GET /api/graph N\'EXPOSE PAS les champs sensibles (Priorité 6)', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/graph' });
        const raw = res.payload;
        // Aucune URL MCP interne, prompt système ni secret de notification.
        expect(raw).not.toContain('serverUrl');
        expect(raw).not.toContain('mcp://red');
        expect(raw).not.toContain('systemPrompt');
        expect(raw).not.toContain('notificationChannels');
        expect(raw).not.toContain('slackWebhook');
        // En revanche, l'indicateur non sensible est présent.
        const red = res.json().nodes.find((n: { id: string }) => n.id === 'red');
        expect(red.mcp).toEqual({ configured: true, connectedTo: [] });
        expect(red).not.toHaveProperty('mcpConfig');
    });

    it('POST /api/nodes/:id/run lance un nœud (200)', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/nodes/red/run' });
        expect(res.statusCode).toBe(200);
    });

    it('POST /api/nodes/:id/approve sur un nœud non WAITING → 409 Conflict', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/nodes/hum/approve' });
        expect(res.statusCode).toBe(409);
    });

    it('POST /api/nodes/:id/approve sur un nœud WAITING → 200 + statut IDLE', async () => {
        // Lance le flux pour mettre l'humain en WAITING_HUMAN_APPROVAL
        await engine.runFlow('red');
        expect((await store.get('hum')).status).toBe('WAITING_HUMAN_APPROVAL');

        const res = await app.inject({ method: 'POST', url: '/api/nodes/hum/approve' });
        expect(res.statusCode).toBe(200);
        expect((await store.get('hum')).status).toBe('IDLE');
    });

    it('POST /api/nodes/:id/reject avec feedback → 200 + ERROR', async () => {
        await engine.runFlow('red');
        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/hum/reject',
            payload: { feedback: 'KO' },
        });
        expect(res.statusCode).toBe(200);
        expect((await store.get('hum')).status).toBe('ERROR');
    });

    it('POST /api/nodes/:id/reset → 200 + IDLE', async () => {
        await engine.runFlow('red');
        await engine.reject('hum', 'KO');
        expect((await store.get('hum')).status).toBe('ERROR');
        const res = await app.inject({ method: 'POST', url: '/api/nodes/hum/reset' });
        expect(res.statusCode).toBe(200);
        expect((await store.get('hum')).status).toBe('IDLE');
    });

    it('POST /api/nodes/:id/run sur un id inconnu → 404', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/nodes/nope/run' });
        expect(res.statusCode).toBe(404);
    });

    it('POST /api/nodes/:id/run → 502 si l\'exécution MCP échoue (pas de faux succès)', async () => {
        const store2 = new InMemoryGraphStore();
        store2.load(SEED);
        const mcp = { runNode: async () => ({ ok: false as const, error: 'mcp down' }) };
        const engine2 = new OrchestrationEngine(store2, mcp);
        const app2 = buildServer({ store: store2, engine: engine2 });
        const res = await app2.inject({ method: 'POST', url: '/api/nodes/red/run' });
        expect(res.statusCode).toBe(502);
        expect(res.json().error).toBe('mcp down');
        expect((await store2.get('red')).status).toBe('ERROR');
        await app2.close();
    });

    it('POST /api/nodes/:id/run-flow exécute la chaîne jusqu\'au nœud humain', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/nodes/red/run-flow' });
        expect(res.statusCode).toBe(200);
        expect(res.json().waitingHumanAt).toBe('hum');
        expect((await store.get('hum')).status).toBe('WAITING_HUMAN_APPROVAL');
    });

    it('GET /api/events ouvre un flux SSE et émet sur transition', async () => {
        // Lance la requête SSE en parallèle, déclenche une transition, vérifie le payload
        const responsePromise = app.inject({
            method: 'GET',
            url: '/api/events',
            payloadAsStream: true,
        });

        // Petit délai pour laisser fastify ouvrir le stream
        await new Promise((r) => setTimeout(r, 50));

        // Déclenche une transition
        store.applyTransition('red', 'EXECUTING');

        // Lit le premier chunk
        const res = await responsePromise;
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');

        const reader = res.stream();
        const chunks: string[] = [];
        for await (const c of reader) {
            chunks.push(c.toString());
            if (chunks.join('').includes('NODE_STATUS_CHANGED')) break;
        }
        const data = chunks.join('');
        expect(data).toContain('NODE_STATUS_CHANGED');
        expect(data).toContain('"nodeId":"red"');
        expect(data).toContain('"to":"EXECUTING"');
    });
});
