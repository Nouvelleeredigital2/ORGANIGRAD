import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerSynapseConsumer } from '../src/synapse/consumer.js';

/**
 * Le consumer ingère les `validation.requested` VENUES DES AUTRES apps.
 * Il doit ignorer les siennes : le producteur (hop 1) en publie une pour chaque
 * nœud entrant en attente humaine, et les reprendre ouvrirait un second chemin
 * de décision qui contourne la machine à états.
 */

const BUS = 'http://bus.test';

function evenement(id: string, sourceApp: string, type = 'validation.requested') {
    return { id, type, sourceApp, createdAt: '2026-08-04T10:00:00.000Z', payload: { title: `Titre ${id}` } };
}

async function consumerAvecEvenements(items: Array<Record<string, unknown>>) {
    vi.stubEnv('SYNAPSE_URL', BUS);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })),
    );
    const app = Fastify({ logger: false });
    registerSynapseConsumer(app);
    await app.ready();
    // Le premier poll est lancé au montage ; on laisse la micro-tâche s'exécuter.
    await new Promise((r) => setTimeout(r, 20));
    const res = await app.inject({ method: 'GET', url: '/api/synapse/validations' });
    const corps = res.json() as { items: Array<{ id: string; sourceApp: string }>; synapse: string };
    await app.close();
    return corps;
}

beforeEach(() => {
    vi.useRealTimers();
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('consumer Synapse', () => {
    it('ingère les demandes venues des autres apps', async () => {
        const corps = await consumerAvecEvenements([evenement('evt-1', 'hermes-vps')]);
        expect(corps.items.map((i) => i.id)).toEqual(['evt-1']);
        expect(corps.synapse).toBe('live');
    });

    it('ignore ses PROPRES demandes (pas de double chemin de décision)', async () => {
        const corps = await consumerAvecEvenements([
            evenement('evt-moi', 'organigrad'),
            evenement('evt-MOI-casse', 'ORGANIGRAD'),
            evenement('evt-autre', 'link'),
        ]);
        expect(corps.items.map((i) => i.id)).toEqual(['evt-autre']);
    });

    it("n'ingère que le type validation.requested", async () => {
        const corps = await consumerAvecEvenements([
            evenement('evt-bruit', 'hermes-vps', 'content.created'),
            evenement('evt-vrai', 'hermes-vps'),
        ]);
        expect(corps.items.map((i) => i.id)).toEqual(['evt-vrai']);
    });

    it('reste inactif sans SYNAPSE_URL', async () => {
        vi.unstubAllEnvs();
        vi.stubEnv('SYNAPSE_URL', '');
        const app = Fastify({ logger: false });
        registerSynapseConsumer(app);
        await app.ready();
        const res = await app.inject({ method: 'GET', url: '/api/synapse/validations' });
        expect((res.json() as { synapse: string }).synapse).toBe('disabled');
        await app.close();
    });
});
