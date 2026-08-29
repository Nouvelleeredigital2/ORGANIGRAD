import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import { registerSynapseConsumer } from '../src/synapse/consumer.js';
import { SCOPES } from '../src/api/scopes.js';

/**
 * Le consumer ingère les `validation.requested` VENUES DES AUTRES apps.
 * Il doit ignorer les siennes : le producteur (hop 1) en publie une pour chaque
 * nœud entrant en attente humaine, et les reprendre ouvrirait un second chemin
 * de décision qui contourne la machine à états.
 *
 * Cloisonnement par workspace (2026-08-11) : `registerSynapseConsumer` ne pose
 * pas lui-même l'auth (c'est `buildAuthHook`, en amont, dans `pgServer.ts`) —
 * ici on simule son effet (`req.workspaceId` / `req.scopes`) via un header de
 * test, pour tester le consumer en isolation comme avant.
 */

declare module 'fastify' {
    interface FastifyRequest {
        workspaceId?: string;
        scopes?: string[];
    }
}

const BUS = 'http://bus.test';

function evenement(
    id: string,
    sourceApp: string,
    opts: { type?: string; workspaceId?: string | null } = {},
) {
    const { type = 'validation.requested', workspaceId = 'ws-a' } = opts;
    return {
        id,
        type,
        sourceApp,
        createdAt: '2026-08-04T10:00:00.000Z',
        payload: {
            title: `Titre ${id}`,
            ...(workspaceId !== null ? { workspaceId } : {}),
        },
    };
}

/** Simule l'auth hook réel : lit `x-test-workspace-id` / `x-test-scopes`. */
function stubAuth(app: ReturnType<typeof Fastify>) {
    app.addHook('onRequest', async (req: FastifyRequest) => {
        const ws = req.headers['x-test-workspace-id'];
        req.workspaceId = typeof ws === 'string' ? ws : undefined;
        const sc = req.headers['x-test-scopes'];
        req.scopes = typeof sc === 'string' ? sc.split(',') : [SCOPES.humanApprove, SCOPES.humanReject];
    });
}

async function monteConsumer(
    items: Array<Record<string, unknown>>,
    opts: { now?: () => number; pollMs?: number } = {},
) {
    vi.stubEnv('SYNAPSE_URL', BUS);
    // Le bus réel ne rend qu'une FENÊTRE glissante (`?limit=50`) : un événement
    // fini par sortir de cette fenêtre à mesure que d'autres s'accumulent — il
    // n'est pas re-servi indéfiniment. On modélise ça en ne le rendant qu'une
    // fois, sans quoi un test de TTL avec polling rapide re-ingérerait
    // l'événement à chaque tick juste après l'avoir balayé.
    let polls = 0;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
            if (String(url).includes('/api/events?')) {
                const body = polls === 0 ? items : [];
                polls += 1;
                return new Response(JSON.stringify({ items: body }), { status: 200 });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
    );
    const app = Fastify({ logger: false });
    stubAuth(app);
    registerSynapseConsumer(app, opts);
    await app.ready();
    // Le premier poll est lancé au montage ; on laisse la micro-tâche s'exécuter.
    await new Promise((r) => setTimeout(r, 20));
    return app;
}

async function listeValidations(app: Awaited<ReturnType<typeof monteConsumer>>, workspaceId: string) {
    const res = await app.inject({
        method: 'GET',
        url: '/api/synapse/validations',
        headers: { 'x-test-workspace-id': workspaceId },
    });
    return res.json() as { items: Array<{ id: string; sourceApp: string }>; synapse: string };
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
        const app = await monteConsumer([evenement('evt-1', 'hermes-vps')]);
        const corps = await listeValidations(app, 'ws-a');
        expect(corps.items.map((i) => i.id)).toEqual(['evt-1']);
        expect(corps.synapse).toBe('live');
        await app.close();
    });

    it('ignore ses PROPRES demandes (pas de double chemin de décision)', async () => {
        const app = await monteConsumer([
            evenement('evt-moi', 'organigrad'),
            evenement('evt-MOI-casse', 'ORGANIGRAD'),
            evenement('evt-autre', 'link'),
        ]);
        const corps = await listeValidations(app, 'ws-a');
        expect(corps.items.map((i) => i.id)).toEqual(['evt-autre']);
        await app.close();
    });

    it("n'ingère que le type validation.requested", async () => {
        const app = await monteConsumer([
            evenement('evt-bruit', 'hermes-vps', { type: 'content.created' }),
            evenement('evt-vrai', 'hermes-vps'),
        ]);
        const corps = await listeValidations(app, 'ws-a');
        expect(corps.items.map((i) => i.id)).toEqual(['evt-vrai']);
        await app.close();
    });

    it('reste inactif sans SYNAPSE_URL', async () => {
        vi.unstubAllEnvs();
        vi.stubEnv('SYNAPSE_URL', '');
        const app = Fastify({ logger: false });
        stubAuth(app);
        registerSynapseConsumer(app);
        await app.ready();
        const corps = await listeValidations(app, 'ws-a');
        expect(corps.synapse).toBe('disabled');
        await app.close();
    });

    describe('cloisonnement par workspace', () => {
        it("n'ingère PAS un événement sans workspaceId (pas de panier partagé)", async () => {
            const app = await monteConsumer([evenement('evt-sans-ws', 'hermes-vps', { workspaceId: null })]);
            const corps = await listeValidations(app, 'ws-a');
            expect(corps.items).toEqual([]);
            await app.close();
        });

        it('un workspace ne voit PAS les validations des autres', async () => {
            const app = await monteConsumer([
                evenement('evt-a', 'hermes-vps', { workspaceId: 'ws-a' }),
                evenement('evt-b', 'hermes-vps', { workspaceId: 'ws-b' }),
            ]);
            expect((await listeValidations(app, 'ws-a')).items.map((i) => i.id)).toEqual(['evt-a']);
            expect((await listeValidations(app, 'ws-b')).items.map((i) => i.id)).toEqual(['evt-b']);
            await app.close();
        });

        it("refuse (404) d'approuver une validation d'un AUTRE workspace", async () => {
            const app = await monteConsumer([evenement('evt-a', 'hermes-vps', { workspaceId: 'ws-a' })]);
            const res = await app.inject({
                method: 'POST',
                url: '/api/synapse/validations/evt-a/approve',
                headers: { 'x-test-workspace-id': 'ws-b' },
            });
            expect(res.statusCode).toBe(404);
            // toujours en attente pour son vrai workspace : pas décidée par la tentative
            expect((await listeValidations(app, 'ws-a')).items.map((i) => i.id)).toEqual(['evt-a']);
            await app.close();
        });

        it('refuse (403) sans le scope human:approve / human:reject', async () => {
            const app = await monteConsumer([evenement('evt-a', 'hermes-vps', { workspaceId: 'ws-a' })]);
            const res = await app.inject({
                method: 'POST',
                url: '/api/synapse/validations/evt-a/approve',
                headers: { 'x-test-workspace-id': 'ws-a', 'x-test-scopes': 'graph:read' },
            });
            expect(res.statusCode).toBe(403);
            await app.close();
        });

        it('approuve normalement une validation de son propre workspace avec le bon scope', async () => {
            const app = await monteConsumer([evenement('evt-a', 'hermes-vps', { workspaceId: 'ws-a' })]);
            const res = await app.inject({
                method: 'POST',
                url: '/api/synapse/validations/evt-a/approve',
                headers: { 'x-test-workspace-id': 'ws-a' },
            });
            expect(res.statusCode).toBe(202);
            expect((await listeValidations(app, 'ws-a')).items).toEqual([]);
            await app.close();
        });
    });

    describe('TTL — audit P2 (fuite mémoire de la file `pending`)', () => {
        // `pollMs` court (vrais timers) plutôt que des timers factices : le
        // `setInterval` du consumer est créé AVANT tout `vi.useFakeTimers()`
        // dans ce fichier, donc il resterait un timer réel non affecté par
        // l'avance de temps simulé — plus simple et plus fiable d'accélérer
        // le polling lui-même.
        it('balaie une validation jamais décidée après 24h', async () => {
            let clock = 0;
            const app = await monteConsumer([evenement('evt-old', 'hermes-vps')], {
                now: () => clock,
                pollMs: 5,
            });
            expect((await listeValidations(app, 'ws-a')).items.map((i) => i.id)).toEqual(['evt-old']);

            // 24h + 1s plus tard : le prochain poll doit balayer l'entrée.
            clock += 24 * 60 * 60 * 1000 + 1000;
            await new Promise((r) => setTimeout(r, 30));

            expect((await listeValidations(app, 'ws-a')).items).toEqual([]);
            await app.close();
        });

        it('ne balaie pas une validation récente', async () => {
            let clock = 0;
            const app = await monteConsumer([evenement('evt-recent', 'hermes-vps')], {
                now: () => clock,
                pollMs: 5,
            });

            clock += 60_000; // 1 minute plus tard, largement sous les 24h
            await new Promise((r) => setTimeout(r, 30));

            expect((await listeValidations(app, 'ws-a')).items.map((i) => i.id)).toEqual(['evt-recent']);
            await app.close();
        });
    });
});
