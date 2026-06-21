import { describe, it, expect, vi } from 'vitest';
import {
    dispatchMcpRequest,
    TOOLS,
    PROTOCOL_VERSION,
    SERVER_INFO,
} from '../src/mcp/mcpServer.js';
import { ALL_SCOPES, SCOPES } from '../src/api/scopes.js';

/**
 * Tests du dispatcher MCP — couvre le protocole JSON-RPC 2.0 et la liste
 * des outils. Les outils invoqués (callTool → PgGraphStore) sont testés
 * séparément via le mode in-memory ; ici on stub le SQL pour les chemins
 * happy-path et erreur.
 */

function mockSql(rows: unknown[] = []) {
    const tx = vi.fn().mockImplementation(async (cb: (tx: typeof tag) => Promise<unknown>) => cb(tag));
    const tag = vi.fn(async () => rows) as unknown as import('postgres').Sql;
    (tag as unknown as { begin: typeof tx }).begin = tx;
    return tag;
}

describe('MCP Server — protocole JSON-RPC 2.0', () => {
    const sql = mockSql();
    // Contexte « pleins droits » : ces tests vérifient le PROTOCOLE et la
    // validation des arguments, pas l'autorisation (testée plus bas).
    const ctx = { sql, workspaceId: 'ws-1', scopes: [...ALL_SCOPES] };

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

    it('tools/list énumère les 6 outils Organigrad', async () => {
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
            'run_flow',
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
            { sql: sqlRows, workspaceId: 'ws-1', scopes: [SCOPES.graphRead] },
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

describe('MCP Server — autorisation par scopes (Priorité 2)', () => {
    const sql = mockSql();
    const FORBIDDEN = -32003;

    // Clé « agent technique » : peut lire et lancer, mais PAS valider/rejeter/reset.
    const agentScopes = [SCOPES.graphRead, SCOPES.nodeRead, SCOPES.nodeRun, SCOPES.executionRead];

    function call(name: string, scopes: string[], args: Record<string, unknown> = {}) {
        return dispatchMcpRequest(
            { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } },
            { sql, workspaceId: 'ws-1', scopes },
        );
    }

    it('une clé agent (node:run) NE PEUT PAS approuver', async () => {
        const res = await call('approve_node', agentScopes, { node_id: 'n1' });
        expect(res?.error?.code).toBe(FORBIDDEN);
        expect(res?.error?.data).toMatchObject({ required: SCOPES.humanApprove });
    });

    it('une clé agent NE PEUT PAS rejeter', async () => {
        const res = await call('reject_node', agentScopes, { node_id: 'n1', feedback: 'x' });
        expect(res?.error?.code).toBe(FORBIDDEN);
        expect(res?.error?.data).toMatchObject({ required: SCOPES.humanReject });
    });

    it('une clé agent NE PEUT PAS reset', async () => {
        const res = await call('reset_node', agentScopes, { node_id: 'n1' });
        expect(res?.error?.code).toBe(FORBIDDEN);
        expect(res?.error?.data).toMatchObject({ required: SCOPES.nodeReset });
    });

    it('une clé sans aucun scope NE PEUT PAS lister', async () => {
        const res = await call('list_nodes', []);
        expect(res?.error?.code).toBe(FORBIDDEN);
        expect(res?.error?.data).toMatchObject({ required: SCOPES.graphRead });
    });

    it('une clé sans node:run NE PEUT PAS lancer', async () => {
        const res = await call('run_node', [SCOPES.graphRead], { node_id: 'n1' });
        expect(res?.error?.code).toBe(FORBIDDEN);
        expect(res?.error?.data).toMatchObject({ required: SCOPES.nodeRun });
    });

    it('avec le scope human:approve, le contrôle de scope passe (échoue ensuite sur l\'argument)', async () => {
        const res = await call('approve_node', [SCOPES.humanApprove], {});
        // Le scope est OK → on atteint la validation d'argument (node_id manquant).
        expect(res?.error?.code).not.toBe(FORBIDDEN);
        expect(res?.error?.message).toMatch(/node_id/);
    });
});
