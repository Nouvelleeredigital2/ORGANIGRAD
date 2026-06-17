import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorClient, OrchestratorClientError } from './orchestratorService';

const GRAPH = {
    nodes: [
        { id: 'a', type: 'AGENT_IA', nom: 'A', roleTitre: 'a', parentID: null, gradeId: 'E', status: 'IDLE' },
    ],
};

describe('OrchestratorClient', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let client: OrchestratorClient;

    beforeEach(() => {
        fetchMock = vi.fn();
        client = new OrchestratorClient({ fetchImpl: fetchMock as typeof fetch });
    });

    it('isReachable() true sur 200', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(GRAPH), { status: 200 }));
        expect(await client.isReachable()).toBe(true);
    });

    it('isReachable() false sur exception réseau', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
        expect(await client.isReachable()).toBe(false);
    });

    it('fetchGraph() retourne la liste des nœuds', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(GRAPH), { status: 200 }));
        const nodes = await client.fetchGraph();
        expect(nodes).toHaveLength(1);
        expect(nodes[0]!.id).toBe('a');
    });

    it('runNode() POST sur /nodes/:id/run', async () => {
        fetchMock.mockResolvedValue(new Response('', { status: 200 }));
        await client.runNode('a');
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toMatch(/\/nodes\/a\/run$/);
        expect((init as RequestInit).method).toBe('POST');
    });

    it('reject() inclut feedback dans le body', async () => {
        fetchMock.mockResolvedValue(new Response('', { status: 200 }));
        await client.reject('a', 'KO');
        const init = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(JSON.parse(init.body as string)).toEqual({ feedback: 'KO' });
    });

    it('409 → OrchestratorClientError(ILLEGAL_TRANSITION)', async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: 'ILLEGAL_TRANSITION' }), { status: 409 }),
        );
        await expect(client.approve('a')).rejects.toMatchObject({
            code: 'ILLEGAL_TRANSITION',
            status: 409,
        });
        await expect(client.approve('a').catch((e) => e)).resolves.toBeInstanceOf(
            OrchestratorClientError,
        );
    });

    it('404 → NODE_NOT_FOUND', async () => {
        fetchMock.mockResolvedValue(new Response('', { status: 404 }));
        await expect(client.runNode('nope')).rejects.toMatchObject({ code: 'NODE_NOT_FOUND' });
    });

    it('subscribe() obtient un ticket puis reçoit les transitions via EventSource', async () => {
        // Le flux demande d'abord un ticket SSE (POST /events/ticket).
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ ticket: 'tkt-1' }), { status: 200 }),
        );
        const listeners = new Map<string, (e: MessageEvent) => void>();
        const close = vi.fn();
        function FakeES(this: Record<string, unknown>) {
            this.addEventListener = (k: string, h: (e: MessageEvent) => void) => listeners.set(k, h);
            this.removeEventListener = (k: string) => listeners.delete(k);
            this.close = close;
        }
        const c = new OrchestratorClient({
            fetchImpl: fetchMock as typeof fetch,
            eventSourceImpl: FakeES as unknown as typeof EventSource,
        });

        const received: unknown[] = [];
        const off = c.subscribe((e) => received.push(e));

        // Attend la résolution du ticket + l'ouverture de l'EventSource.
        await vi.waitFor(() => expect(listeners.has('NODE_STATUS_CHANGED')).toBe(true));

        const payload = {
            type: 'NODE_STATUS_CHANGED',
            nodeId: 'a',
            from: 'IDLE',
            to: 'EXECUTING',
            timestamp: '2026-05-17T00:00:00Z',
            payload: null,
        };
        listeners.get('NODE_STATUS_CHANGED')!({ data: JSON.stringify(payload) } as MessageEvent);
        expect(received).toEqual([payload]);

        off();
        expect(close).toHaveBeenCalled();
    });

    it('inclut le Bearer apiKey dans les requêtes REST', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(GRAPH), { status: 200 }));
        const c = new OrchestratorClient({
            fetchImpl: fetchMock as typeof fetch,
            apiKey: 'ok_secret123',
        });
        await c.fetchGraph();
        const init = fetchMock.mock.calls[0]![1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer ok_secret123');
    });

    it('ouvre le flux SSE via un ticket à usage unique — JAMAIS la clé dans l\'URL', async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ ticket: 'tkt-xyz' }), { status: 200 }),
        );
        let capturedUrl = '';
        const FakeES = vi.fn().mockImplementation(function (this: Record<string, unknown>, url: string) {
            capturedUrl = url;
            this.addEventListener = () => {};
            this.removeEventListener = () => {};
            this.close = () => {};
        });
        const c = new OrchestratorClient({
            fetchImpl: fetchMock as typeof fetch,
            eventSourceImpl: FakeES as unknown as typeof EventSource,
            apiKey: 'ok_secret',
            baseUrl: 'http://o/api',
        });
        const off = c.subscribe(() => {});
        await vi.waitFor(() => expect(capturedUrl).not.toBe(''));

        // L'EventSource est ouvert avec le TICKET, pas la clé API.
        expect(capturedUrl).toBe('http://o/api/events?ticket=tkt-xyz');
        expect(capturedUrl).not.toContain('ok_secret');

        // La clé API ne circule que dans le header Bearer de la requête de ticket.
        const [ticketUrl, init] = fetchMock.mock.calls[0]!;
        expect(ticketUrl).toBe('http://o/api/events/ticket');
        expect((init as RequestInit).method).toBe('POST');
        expect((init!.headers as Record<string, string>).authorization).toBe('Bearer ok_secret');
        off();
    });

    it('subscribe() est no-op si aucun EventSource disponible', () => {
        const c = new OrchestratorClient({
            fetchImpl: fetchMock as typeof fetch,
            eventSourceImpl: undefined as unknown as typeof EventSource,
        });
        const off = c.subscribe(() => {});
        expect(typeof off).toBe('function');
    });
});
