import { describe, it, expect, vi } from 'vitest';
import {
    dispatchMcpRequest,
    TOOLS,
    PROTOCOL_VERSION,
    SERVER_INFO,
} from '../src/mcp/mcpServer.js';

/**
 * Tests du dispatcher MCP — couvre le protocole JSON-RPC 2.0 et la liste
 * des outils. Les outils invoqués (callTool → PgGraphStore) sont testés
 * séparément via le mode in-memory ; ici on stub le SQL pour les chemins
 * happy-path et erreur.
 */

function mockSql(rows: unknown[] = []) {
    const tx = vi.fn().mockImplementation(async (cb: (tx: typeof tag) => Promise<unknown>) => cb(tag));
    const tag = vi.fn(async (..._args: unknown[]) => rows) as unknown as import('postgres').Sql;
    (tag as unknown as { begin: typeof tx }).begin = tx;
    return tag;
}

describe('MCP Server — protocole JSON-RPC 2.0', () => {
    const sql = mockSql();
    const ctx = { sql, workspaceId: 'ws-1' };

    it("répond à initialize avec serverInfo + protocolVersion", async () => {
        const res = await dispatchMcpRequest(
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
            ctx,
        );
        expect(res).toMatchObject({
            jsonrpc: '2.0',
            id: 1,
            result: {
                protocolVersion: PROTOCOL_VERSION,
                serverInfo: SERVER_INFO,
                capabilities: { tools: {} },
            },
        });
    });

    it('notifications/initialized → null (pas de réponse)', async () => {
        const res = await dispatchMcpRequest(
            { jsonrpc: '2.0', method: 'notifications/initialized' },
            ctx,
        );
        expect(res).toBeNull();
    });

    it('ping → {} avec le même id', async () => {
        const res = await dispatchMcpRequest({ jsonrpc: '2.0', id: 'p1', method: 'ping' }, ctx);
        expect(res).toEqual({ jsonrpc: '2.0', id: 'p1', result: {} });
    });

    it('tools/list énumère les 5 outils Organigrad', async () => {
        const res = await dispatchMcpRequest(
            { jsonrpc: '2.0', id: 2, method: 'tools/list' },
            ctx,
        );
        expect(res?.result).toMatchObject({ tools: TOOLS });
        const tools = (res?.result as { tools: { name: string }[] }).tools;
        const names = tools.map((t) => t.name).sort();
        expect(names).toEqual([
            'approve_node',
            'list_nodes',
            'reject_node',
            'reset_node',
            'run_node',
        ]);
    });

    it('méthode inconnue → JSON-RPC error -32601', async () => {
        const res = await dispatchMcpRequest(
            { jsonrpc: '2.0', id: 3, method: 'foo/bar' },
            ctx,
        );
        expect(res?.error?.code).toBe(-32601);
    });

    it('tools/call avec nom inconnu → erreur', async () => {
        const res = await dispatchMcpRequest(
            { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'wat', arguments: {} } },
            ctx,
        );
        expect(res?.error).toBeDefined();
    });

    it("list_nodes appelle bien le store et renvoie un payload `content + structuredContent`", async () => {
        const rows = [
            {
                id: 'n1',
                workspace_id: 'ws-1',
                type: 'AGENT_IA',
                nom: 'IA',
                role_titre: 'r',
                parent_id: null,
                grade_id: 'E',
                system_prompt: null,
                skills: [],
                mcp_config: null,
                notification_channels: null,
                avatar_url: null,
                status: 'IDLE',
            },
        ];
        const sqlRows = mockSql(rows);
        const res = await dispatchMcpRequest(
            { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_nodes', arguments: {} } },
            { sql: sqlRows, workspaceId: 'ws-1' },
        );
        expect(res?.result).toMatchObject({
            content: [{ type: 'text' }],
            structuredContent: { nodes: expect.any(Array) },
        });
    });

    it('approve_node sans node_id → erreur de paramètre', async () => {
        const res = await dispatchMcpRequest(
            { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'approve_node', arguments: {} } },
            ctx,
        );
        expect(res?.error).toBeDefined();
        expect(res?.error?.message).toMatch(/node_id/);
    });

    it('reject_node exige node_id ET feedback', async () => {
        const res = await dispatchMcpRequest(
            {
                jsonrpc: '2.0',
                id: 7,
                method: 'tools/call',
                params: { name: 'reject_node', arguments: { node_id: 'x' } },
            },
            ctx,
        );
        expect(res?.error?.message).toMatch(/feedback/);
    });
});
