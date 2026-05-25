import { describe, it, expect, vi } from 'vitest';
import { McpClient } from '../src/mcp/mcpClient.js';
import type { HybridNode } from '../src/domain/types.js';

/**
 * Tests du client MCP — le transport HTTP réel est mocké via `fetch` global.
 * Les vérifications portent sur :
 *   - URL appelée
 *   - parsing par TYPE de bloc (jamais par position)
 *   - timeout / échec de connexion → { ok: false }
 */

const node = (extra: Partial<HybridNode> = {}): HybridNode => ({
    id: 'ia-1',
    type: 'AGENT_IA',
    nom: 'Test',
    roleTitre: 'r',
    parentID: null,
    gradeId: 'Expert',
    systemPrompt: 'Tu es un assistant.',
    mcpConfig: { serverUrl: 'http://localhost:9999/mcp', connectedTo: [] },
    status: 'IDLE',
    ...extra,
});

describe('McpClient', () => {
    it('runNode appelle l\'URL du nœud et renvoie { ok: true, output }', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    result: {
                        content: [
                            { type: 'text', text: 'pre' },
                            { type: 'mcp_tool_result', value: { livrable: 'Texte généré' } },
                        ],
                    },
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        );

        const client = new McpClient({ fetchImpl: fetchMock, timeoutMs: 1000 });
        const res = await client.runNode(node());

        expect(fetchMock).toHaveBeenCalledOnce();
        const calledUrl = fetchMock.mock.calls[0]![0] as string;
        expect(calledUrl).toBe('http://localhost:9999/mcp');
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.output).toEqual({ livrable: 'Texte généré' });
        }
    });

    it('parse les blocs par TYPE — l\'ordre n\'importe pas', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    result: {
                        content: [
                            { type: 'mcp_tool_result', value: { ok: 1 } },
                            { type: 'text', text: 'post-text' },
                        ],
                    },
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        );
        const client = new McpClient({ fetchImpl: fetchMock, timeoutMs: 1000 });
        const res = await client.runNode(node());
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.output).toEqual({ ok: 1 });
    });

    it('renvoie { ok: false } si l\'URL est manquante', async () => {
        const fetchMock = vi.fn();
        const client = new McpClient({ fetchImpl: fetchMock, timeoutMs: 1000 });
        const res = await client.runNode({ ...node(), mcpConfig: undefined });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/mcpConfig/i);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('renvoie { ok: false } sur échec HTTP', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response('boom', { status: 500 }));
        const client = new McpClient({ fetchImpl: fetchMock, timeoutMs: 1000 });
        const res = await client.runNode(node());
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/500/);
    });

    it('renvoie { ok: false } sur exception de connexion', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        const client = new McpClient({ fetchImpl: fetchMock, timeoutMs: 1000 });
        const res = await client.runNode(node());
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/ECONNREFUSED/);
    });

    it('renvoie { ok: false } sur timeout', async () => {
        const fetchMock = vi.fn(
            (_url: string, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new Error('aborted'));
                    });
                }),
        );
        const client = new McpClient({ fetchImpl: fetchMock as typeof fetch, timeoutMs: 30 });
        const res = await client.runNode(node());
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/timeout|abort/i);
    });

    it('si aucun mcp_tool_result, renvoie ok avec output null (et concatène les blocs text en debug)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    result: { content: [{ type: 'text', text: 'que du texte' }] },
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            ),
        );
        const client = new McpClient({ fetchImpl: fetchMock, timeoutMs: 1000 });
        const res = await client.runNode(node());
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.output).toBeNull();
            expect(res.text).toBe('que du texte');
        }
    });
});
