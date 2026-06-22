import { describe, it, expect, vi } from 'vitest';
import { parseEvent } from '@apps2026/contracts';
import {
    buildValidationRequestedEvent,
    createSynapseProducer,
    type HumanGateNotifier,
} from '../src/synapse/producer.js';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { InMemoryGraphStore } from '../src/state/graphStore.js';
import type { HybridNode } from '../src/domain/types.js';

const humanNode: HybridNode = {
    id: 'node-approval-1',
    type: 'HUMAN',
    nom: 'Validation directrice',
    roleTitre: 'Directrice artistique',
    parentID: null,
    gradeId: 'grade-admin',
    status: 'IDLE',
};

/** Stub MCP : jamais appelé pour un nœud HUMAN, mais doit typer correctement. */
const mcpStub = { runNode: async () => ({ ok: true as const, output: null }) };

describe('buildValidationRequestedEvent', () => {
    it('produit une enveloppe canonique acceptée par parseEvent (Zod strict)', () => {
        const evt = buildValidationRequestedEvent(humanNode);
        expect(() => parseEvent(evt)).not.toThrow();
        expect(evt.type).toBe('validation.requested');
        expect(evt.sourceApp).toBe('organigrad');
        expect(evt.validationId).toBe('node-approval-1');
        expect(evt.targetApps).toEqual(['link']);
        expect(evt.status).toBe('pending');
        expect(evt.version).toBe('1.0');
    });

    it('dérive un correlationId déterministe (idempotence côté bus)', () => {
        const a = buildValidationRequestedEvent(humanNode);
        const b = buildValidationRequestedEvent(humanNode);
        expect(a.correlationId).toBe('val-node-approval-1');
        expect(b.correlationId).toBe(a.correlationId);
    });

    it('porte le contexte humain dans le payload', () => {
        const evt = buildValidationRequestedEvent(humanNode);
        expect(evt.payload.nodeId).toBe('node-approval-1');
        expect(String(evt.payload.title)).toContain('Validation directrice');
        expect(evt.payload.roleTitle).toBe('Directrice artistique');
    });
});

describe('createSynapseProducer', () => {
    it('est un no-op sans SYNAPSE_URL (hors démo)', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const producer = createSynapseProducer({ synapseUrl: undefined });
        await producer.onHumanGate(humanNode);
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('POSTe une enveloppe valide vers {base}/api/events', async () => {
        const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
        vi.stubGlobal('fetch', fetchSpy);
        const producer = createSynapseProducer({ synapseUrl: 'http://synapse.test/' });
        await producer.onHumanGate(humanNode);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { body: string }];
        expect(url).toBe('http://synapse.test/api/events');
        const body = JSON.parse(init.body);
        expect(() => parseEvent(body)).not.toThrow();
        expect(body.type).toBe('validation.requested');
        vi.unstubAllGlobals();
    });

    it('ne lève pas si le bus est injoignable (best-effort)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        }));
        const producer = createSynapseProducer({ synapseUrl: 'http://down.test' });
        await expect(producer.onHumanGate(humanNode)).resolves.toBeUndefined();
        vi.unstubAllGlobals();
    });
});

describe('OrchestrationEngine — émission au nœud HUMAN', () => {
    it('appelle le notifier quand le flux atteint un garant humain', async () => {
        const store = new InMemoryGraphStore();
        store.load([humanNode]);
        const calls: string[] = [];
        const notifier: HumanGateNotifier = {
            async onHumanGate(node) {
                calls.push(node.id);
            },
        };
        const engine = new OrchestrationEngine(store, mcpStub, notifier);
        const res = await engine.runFlow('node-approval-1');
        expect(res.waitingHumanAt).toBe('node-approval-1');
        expect(calls).toEqual(['node-approval-1']);
    });

    it('sans notifier, le flux HUMAN reste strictement inchangé', async () => {
        const store = new InMemoryGraphStore();
        store.load([humanNode]);
        const engine = new OrchestrationEngine(store, mcpStub);
        const res = await engine.runFlow('node-approval-1');
        expect(res.waitingHumanAt).toBe('node-approval-1');
    });

    it("une panne du notifier n'interrompt pas l'orchestration", async () => {
        const store = new InMemoryGraphStore();
        store.load([humanNode]);
        const notifier: HumanGateNotifier = {
            async onHumanGate() {
                throw new Error('bus down');
            },
        };
        const engine = new OrchestrationEngine(store, mcpStub, notifier);
        const res = await engine.runFlow('node-approval-1');
        expect(res.ok).toBe(true);
        expect(res.waitingHumanAt).toBe('node-approval-1');
    });
});
