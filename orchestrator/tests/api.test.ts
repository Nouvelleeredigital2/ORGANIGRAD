import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import type { HybridNode } from '../src/domain/types.js';
import { GraphStore } from '../src/state/graphStore.js';
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
    const store = new GraphStore();
    store.load(SEED);
    const mcp = { runNode: async () => ({ ok: true as const, output: null }) };
    const engine = new OrchestrationEngine(store, mcp);
    return { app: buildServer({ store, engine }), store, engine };
}

describe('API REST + SSE', () => {
    let app: FastifyInstance;
    let store: GraphStore;
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

    it('GET /api/graph renvoie le graphe complet', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/graph' });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.nodes).toHaveLength(2);
        expect(body.nodes.map((n: HybridNode) => n.id)).toEqual(['red', 'hum']);
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
        expect(store.get('hum').status).toBe('WAITING_HUMAN_APPROVAL');

        const res = await app.inject({ method: 'POST', url: '/api/nodes/hum/approve' });
        expect(res.statusCode).toBe(200);
        expect(store.get('hum').status).toBe('IDLE');
    });

    it('POST /api/nodes/:id/reject avec feedback → 200 + ERROR', async () => {
        await engine.runFlow('red');
        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/hum/reject',
            payload: { feedback: 'KO' },
        });
        expect(res.statusCode).toBe(200);
        expect(store.get('hum').status).toBe('ERROR');
    });

    it('POST /api/nodes/:id/reset → 200 + IDLE', async () => {
        await engine.runFlow('red');
        engine.reject('hum', 'KO');
        expect(store.get('hum').status).toBe('ERROR');
        const res = await app.inject({ method: 'POST', url: '/api/nodes/hum/reset' });
        expect(res.statusCode).toBe(200);
        expect(store.get('hum').status).toBe('IDLE');
    });

    it('POST /api/nodes/:id/run sur un id inconnu → 404', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/nodes/nope/run' });
        expect(res.statusCode).toBe(404);
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
