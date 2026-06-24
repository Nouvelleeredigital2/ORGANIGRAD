/**
 * A3 — Hop 5 : vérification que le serveur HTTP Postgres (buildPgServer) émet
 * bien validation.approved / validation.rejected sur Synapse après une décision
 * humaine via POST /api/nodes/:id/approve|reject.
 *
 * Stratégie : on injecte un `synapseProducer` spy via le mock de
 * `createSynapseProducer`, et on stub le minimum de dépendances Postgres pour
 * que les handlers passent sans vraie DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Spies capturés avant que les mocks n'écrasent les modules
// ---------------------------------------------------------------------------
const onDecisionSpy = vi.fn(async () => {});

// ---------------------------------------------------------------------------
// Mocks de modules — doivent être déclarés avant les imports dynamiques
// ---------------------------------------------------------------------------

vi.mock('../src/synapse/producer.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../src/synapse/producer.js')>();
    return {
        ...original,
        createSynapseProducer: vi.fn(() => ({
            onHumanGate: vi.fn(async () => {}),
            onDecision: onDecisionSpy,
        })),
    };
});

vi.mock('../src/state/pgGraphStore.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../src/state/pgGraphStore.js')>();
    const { NodeNotFoundError } = original;

    // Classe-stub : toutes les méthodes résolvent sans rien faire
    class PgGraphStoreStub {
        applyTransition = vi.fn(async () => {});
        list = vi.fn(async () => []);
        get = vi.fn(async () => ({ id: 'n1', status: 'WAITING_HUMAN_APPROVAL' }));
        upsertNode = vi.fn(async (n: unknown) => n);
        deleteNode = vi.fn(async () => {});
        on = vi.fn();
        off = vi.fn();
        emit = vi.fn();
    }

    return {
        ...original,
        NodeNotFoundError,
        PgGraphStore: PgGraphStoreStub,
    };
});

vi.mock('../src/observability/auditLog.js', async () => {
    class PgAuditTrailStub {
        record = vi.fn(async () => {});
    }
    return { PgAuditTrail: PgAuditTrailStub };
});

vi.mock('../src/orchestration/engine.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../src/orchestration/engine.js')>();

    class OrchestrationEngineStub {
        runNode = vi.fn(async () => ({ ok: true as const, output: null }));
        runFlow = vi.fn(async () => ({ ok: true as const, waitingHumanAt: null as string | null }));
        resumeFromChildOf = vi.fn(async () => null);
        approve = vi.fn(async () => {});
        reject = vi.fn(async () => {});
    }

    return {
        ...original,
        OrchestrationEngine: OrchestrationEngineStub,
    };
});

// ---------------------------------------------------------------------------
// SQL stub — seul l'auth hook l'utilise vraiment dans nos tests
// ---------------------------------------------------------------------------
function makeSql() {
    return vi.fn((strings: TemplateStringsArray) => {
        const q = String(strings.join(' ')).toLowerCase();
        if (q.includes('workspace_api_keys')) {
            return Promise.resolve([
                {
                    id: 'key-1',
                    workspace_id: 'ws-test',
                    scopes: [
                        'human:approve',
                        'human:reject',
                        'graph:read',
                        'node:run',
                        'execution:read',
                    ],
                    expires_at: null,
                },
            ]);
        }
        return Promise.resolve([]);
    }) as unknown as import('postgres').Sql;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('pgServer HTTP — Hop 5 : onDecision émis après approve/reject', () => {
    let app: import('fastify').FastifyInstance;

    beforeEach(async () => {
        onDecisionSpy.mockClear();

        const { buildPgServer } = await import('../src/api/pgServer.js');
        app = buildPgServer({ sql: makeSql() });
        await app.ready();
    });

    afterEach(async () => {
        await app?.close();
        vi.clearAllMocks();
    });

    it('POST /api/nodes/:id/approve appelle onDecision("approved") sur le bus Synapse', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/n1/approve',
            headers: { authorization: 'Bearer ok_abc123def456' },
        });

        // La réponse HTTP doit être un succès
        expect([200, 409]).toContain(res.statusCode); // 409 si nœud pas en WAITING — acceptable
        // Le hop 5 doit avoir été tenté
        expect(onDecisionSpy).toHaveBeenCalledWith('n1', 'approved');
    });

    it('POST /api/nodes/:id/reject appelle onDecision("rejected") sur le bus Synapse', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/n2/reject',
            headers: {
                authorization: 'Bearer ok_abc123def456',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ feedback: 'besoin de révision' }),
        });

        expect([200, 409]).toContain(res.statusCode);
        expect(onDecisionSpy).toHaveBeenCalledWith('n2', 'rejected', 'besoin de révision');
    });

    it("une panne de Synapse ne bloque pas la réponse HTTP (best-effort)", async () => {
        onDecisionSpy.mockRejectedValueOnce(new Error('bus down'));

        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/n3/approve',
            headers: { authorization: 'Bearer ok_abc123def456' },
        });

        // Même si onDecision lève, la réponse HTTP doit réussir
        expect([200, 409]).toContain(res.statusCode);
    });
});
