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

    it('runFlow() POST sur /nodes/:id/run-flow (clé API technique)', async () => {
        fetchMock.mockResolvedValue(new Response('', { status: 200 }));
        const c = new OrchestratorClient({ fetchImpl: fetchMock as typeof fetch, apiKey: 'ok_k' });
        await c.runFlow('a');
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toMatch(/\/nodes\/a\/run-flow$/);
        expect((init as RequestInit).method).toBe('POST');
        expect(((init as RequestInit).headers as Record<string, string>).authorization).toBe('Bearer ok_k');
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

    it('envoie updated_at sur une mise à jour et typifie le conflit concurrent', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify(GRAPH), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'CONCURRENT_WRITE' }), { status: 409 }));

        await expect(client.upsertNode({
            id: 'a', type: 'AGENT_IA', nom: 'A', roleTitre: 'a', parentID: null,
            gradeId: 'E', updated_at: '2026-09-01T12:00:00.000Z',
        }, 'workspace-1')).rejects.toMatchObject({
            name: 'OrchestratorConflictError', code: 'CONCURRENT_WRITE', status: 409,
        });
        const init = fetchMock.mock.calls[1]![1] as RequestInit;
        expect(JSON.parse(init.body as string).updated_at).toBe('2026-09-01T12:00:00.000Z');
    });

    it('expose la nouvelle version updated_at renvoyée après une écriture', async () => {
        const updatedAt = '2026-09-01T12:01:00.000Z';
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ exists: true }), { status: 200 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        node: {
                            id: 'n1',
                            type: 'AGENT_IA',
                            nom: 'Rédacteur',
                            roleTitre: 'Expert',
                            parentID: null,
                            gradeId: 'E',
                            status: 'IDLE',
                            updated_at: updatedAt,
                            hasSystemPrompt: false,
                            mcp: { configured: false, connectedTo: [] },
                            notifications: { slack: false, email: false },
                        },
                    }),
                    { status: 200 },
                ),
            );

        const result = await client.upsertNode(
            {
                id: 'n1',
                type: 'AGENT_IA',
                nom: 'Rédacteur',
                roleTitre: 'Expert',
                parentID: null,
                gradeId: 'E',
                updated_at: '2026-09-01T12:00:00.000Z',
            },
            'ws1',
        );

        expect(result.updated_at).toBe(updatedAt);
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

describe('OrchestratorClient — importLinkAgents()', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
    });

    it('POST sur /integrations/link/import avec la session humaine (JWT + workspace)', async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ ok: true, created: 2, updated: 1, skipped: 0, total: 3 }), {
                status: 200,
            }),
        );
        const c = new OrchestratorClient({
            fetchImpl: fetchMock as typeof fetch,
            getUserAuth: async () => ({ token: 'jwt-abc', workspaceId: 'ws-1' }),
        });
        const result = await c.importLinkAgents();
        expect(result).toEqual({ ok: true, created: 2, updated: 1, skipped: 0, total: 3 });

        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toMatch(/\/integrations\/link\/import$/);
        expect((init as RequestInit).method).toBe('POST');
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer jwt-abc');
        expect(headers['x-workspace-id']).toBe('ws-1');
    });

    it('503 (pont non configuré) → OrchestratorClientError', async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: 'LINK_BRIDGE_NOT_CONFIGURED' }), { status: 503 }),
        );
        const c = new OrchestratorClient({
            fetchImpl: fetchMock as typeof fetch,
            getUserAuth: async () => ({ token: 'jwt-abc', workspaceId: 'ws-1' }),
        });
        await expect(c.importLinkAgents()).rejects.toMatchObject({ status: 503 });
    });

    it('403 (clé API sans session humaine) → OrchestratorClientError', async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ error: 'INSUFFICIENT_SCOPE' }), { status: 403 }),
        );
        // Pas de getUserAuth → repli sur la clé API technique, refusée par le serveur.
        const c = new OrchestratorClient({ fetchImpl: fetchMock as typeof fetch, apiKey: 'ok_k' });
        await expect(c.importLinkAgents()).rejects.toMatchObject({ status: 403 });
    });
});

/**
 * P2-17 — erreurs réseau. Chaque code doit être distinguable par l'appelant :
 * un 401 (session expirée) et un 500 (panne serveur) n'appellent pas la même
 * réaction dans l'interface, et aucun des deux ne doit passer pour un succès.
 */
describe('OrchestratorClient — codes HTTP et pannes réseau', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let client: OrchestratorClient;

    beforeEach(() => {
        fetchMock = vi.fn();
        client = new OrchestratorClient({ fetchImpl: fetchMock as typeof fetch });
    });

    for (const status of [401, 403, 429, 500, 503]) {
        it(`${status} sur une action → OrchestratorClientError portant le statut`, async () => {
            fetchMock.mockResolvedValue(new Response('{}', { status }));
            await expect(client.runNode('a')).rejects.toMatchObject({
                name: 'OrchestratorClientError',
                status,
                code: `HTTP_${status}`,
            });
        });

        it(`${status} sur fetchGraph() lève au lieu de renvoyer une liste vide`, async () => {
            // Un tableau vide se lirait comme « organigramme sans nœud » —
            // un faux succès, indiscernable d'un graphe réellement vide.
            fetchMock.mockResolvedValue(new Response('{}', { status }));
            await expect(client.fetchGraph()).rejects.toThrow(String(status));
        });

        it(`${status} rend isReachable() faux`, async () => {
            fetchMock.mockResolvedValue(new Response('{}', { status }));
            expect(await client.isReachable()).toBe(false);
        });
    }

    it('perte réseau pendant une action → rejet, jamais un succès silencieux', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(client.runNode('a')).rejects.toThrow();
    });

    it('un orchestrateur MUET est traité comme injoignable, pas comme une attente infinie', async () => {
        // Cas le plus pénible à diagnostiquer : la connexion est acceptée mais
        // aucune réponse n'arrive. Sans délai maximal, isReachable() ne se
        // résolvait jamais et l'interface restait bloquée sur son état
        // précédent, sans pouvoir dire « indisponible ».
        fetchMock.mockImplementation(
            (_url: string, init?: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () =>
                        reject(new DOMException('Aborted', 'AbortError')),
                    );
                }),
        );
        // Délai court : on vérifie le mécanisme, pas la valeur de production.
        await expect(client.isReachable(20)).resolves.toBe(false);
    });

    it('la sonde passe bien un signal d’abandon', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(GRAPH), { status: 200 }));
        await client.isReachable();
        expect(fetchMock.mock.calls[0]![1]).toMatchObject({ signal: expect.anything() });
    });
});

describe('OrchestratorClient — flux SSE interrompu puis rétabli', () => {
    /** EventSource contrôlable : on déclenche `open` et `error` à la demande. */
    function fabriqueES() {
        const listeners = new Map<string, (e: Event) => void>();
        const instances: Array<{ close: ReturnType<typeof vi.fn> }> = [];
        function FakeES(this: Record<string, unknown>) {
            const close = vi.fn();
            this.addEventListener = (k: string, h: (e: Event) => void) => listeners.set(k, h);
            this.removeEventListener = (k: string) => listeners.delete(k);
            this.close = close;
            instances.push({ close });
        }
        return { FakeES, listeners, instances };
    }

    it("signale l'ouverture du flux, y compris après une reconnexion", async () => {
        const { FakeES, listeners } = fabriqueES();
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ ticket: 'tkt' }), { status: 200 }),
        );
        const client = new OrchestratorClient({
            fetchImpl: fetchMock as typeof fetch,
            eventSourceImpl: FakeES as unknown as typeof EventSource,
        });

        const erreurs: Event[] = [];
        let ouvertures = 0;
        const off = client.subscribe(
            () => {},
            (e) => erreurs.push(e),
            () => {
                ouvertures += 1;
            },
        );

        await vi.waitFor(() => expect(listeners.has('open')).toBe(true));
        listeners.get('open')!(new Event('open'));
        expect(ouvertures).toBe(1);

        // Interruption : l'appelant est prévenu…
        listeners.get('error')!(new Event('error'));
        expect(erreurs).toHaveLength(1);

        // … et le rétablissement AUSSI. Sans ce second signal, l'interface
        // restait « dégradée » à vie même une fois le flux revenu.
        await vi.waitFor(() => expect(listeners.has('open')).toBe(true), { timeout: 5_000 });
        listeners.get('open')!(new Event('open'));
        expect(ouvertures).toBeGreaterThanOrEqual(2);

        off();
    });
});
