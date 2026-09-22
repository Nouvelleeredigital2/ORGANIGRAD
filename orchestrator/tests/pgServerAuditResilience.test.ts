/**
 * Un échec du journal d'audit ne doit JAMAIS faire crasher le process ni
 * bloquer la réponse HTTP. Reproduit un incident de recette du 2026-08-09 :
 * une erreur SQL en cascade sur `audit_log` (pooler en mode transaction,
 * prepared statement invalidé) a fait planter tout l'orchestrateur — le
 * `void audit.record(...)` fire-and-forget ne rattrapait pas le rejet.
 *
 * Ce test force `audit.record()` à rejeter et vérifie qu'aucun
 * `unhandledRejection` n'est émis pendant que la requête HTTP se termine
 * normalement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/synapse/producer.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../src/synapse/producer.js')>();
    return {
        ...original,
        createSynapseProducer: vi.fn(() => ({
            onHumanGate: vi.fn(async () => {}),
            onDecision: vi.fn(async () => {}),
        })),
    };
});

vi.mock('../src/state/pgGraphStore.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../src/state/pgGraphStore.js')>();
    const { NodeNotFoundError } = original;

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

    return { ...original, NodeNotFoundError, PgGraphStore: PgGraphStoreStub };
});

const auditRecordSpy = vi.fn(async () => {
    throw new Error("current transaction is aborted (simulé pooler transaction mode)");
});
vi.mock('../src/observability/auditLog.js', async () => {
    class PgAuditTrailStub {
        record = auditRecordSpy;
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

    return { ...original, OrchestrationEngine: OrchestrationEngineStub };
});

function makeSql() {
    return vi.fn((strings: TemplateStringsArray) => {
        const q = String(strings.join(' ')).toLowerCase();
        if (q.includes('workspace_api_keys')) {
            return Promise.resolve([
                {
                    id: 'key-1',
                    workspace_id: 'ws-test',
                    scopes: ['human:approve', 'human:reject', 'node:reset', 'graph:read'],
                    expires_at: null,
                },
            ]);
        }
        return Promise.resolve([]);
    }) as unknown as import('postgres').Sql;
}

describe('pgServer — résilience du journal d’audit', () => {
    let app: import('fastify').FastifyInstance;
    let unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);

    beforeEach(async () => {
        auditRecordSpy.mockClear();
        unhandled = [];
        process.on('unhandledRejection', onUnhandled);

        const { buildPgServer } = await import('../src/api/pgServer.js');
        app = buildPgServer({ sql: makeSql() });
        await app.ready();
    });

    afterEach(async () => {
        await app?.close();
        process.off('unhandledRejection', onUnhandled);
        vi.clearAllMocks();
    });

    it("un audit qui rejette n'empêche pas la réponse HTTP de reset", async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/n1/reset',
            headers: { authorization: 'Bearer ok_abc123def456' },
        });

        expect([200, 409]).toContain(res.statusCode);
        expect(auditRecordSpy).toHaveBeenCalled();
        // Laisse le microtask de .catch() du recordAudit se résoudre.
        await new Promise((r) => setTimeout(r, 20));
        expect(unhandled).toHaveLength(0);
    });

    it("un audit qui rejette n'empêche pas la réponse HTTP d'approve", async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/n2/approve',
            headers: { authorization: 'Bearer ok_abc123def456' },
        });

        expect([200, 409]).toContain(res.statusCode);
        await new Promise((r) => setTimeout(r, 20));
        expect(unhandled).toHaveLength(0);
    });

    it("un audit qui rejette n'empêche pas la réponse HTTP de reject", async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/nodes/n3/reject',
            headers: {
                authorization: 'Bearer ok_abc123def456',
                'content-type': 'application/json',
            },
            body: JSON.stringify({ feedback: 'test' }),
        });

        expect([200, 409]).toContain(res.statusCode);
        await new Promise((r) => setTimeout(r, 20));
        expect(unhandled).toHaveLength(0);
    });
});
