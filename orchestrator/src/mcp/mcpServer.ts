import type { Sql } from 'postgres';
import { PgGraphStore } from '../state/pgGraphStore.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { McpClient } from './mcpClient.js';
import { IllegalTransitionError } from '../domain/stateMachine.js';
import { NodeNotFoundError } from '../state/pgGraphStore.js';
import { assertScope, MissingScopeError, SCOPES } from '../api/scopes.js';
import { toPublicNodeDTO } from '../api/dto.js';

/**
 * MCP Server — expose le graphe et les transitions de l'orchestrateur en
 * outils MCP consommables par Claude Code et tout client MCP-compatible.
 *
 * Transport : HTTP JSON-RPC 2.0 sur une route Fastify dédiée (`/mcp`).
 * Auth : Bearer API key workspace (mêmes garanties que /api/* REST).
 *
 * Outils :
 *   - list_nodes        : snapshot du graphe
 *   - run_node          : lance un nœud (engine.runNode)
 *   - approve_node      : approuve une attente HITL (→ IDLE)
 *   - reject_node       : rejette une attente HITL avec feedback (→ ERROR)
 *   - reset_node        : reset d'un nœud en ERROR (→ IDLE)
 *
 * Protocole minimum couvert :
 *   - initialize        : handshake + capabilities
 *   - tools/list        : énumère les outils
 *   - tools/call        : invoque un outil
 *   - ping              : keepalive
 */

export const TOOLS = [
    {
        name: 'list_nodes',
        description: "Renvoie le graphe complet des HybridNode du workspace (humains, agents IA, logiciels MCP) avec leur statut courant.",
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'run_node',
        description: "Lance l'exécution d'un nœud (AGENT_IA ou SOFTWARE_MCP). Le nœud passe en EXECUTING ; la machine à états gère la suite.",
        inputSchema: {
            type: 'object',
            properties: {
                node_id: { type: 'string', description: 'UUID du nœud à lancer' },
            },
            required: ['node_id'],
            additionalProperties: false,
        },
    },
    {
        name: 'approve_node',
        description: "Approuve un nœud HUMAN en attente (WAITING_HUMAN_APPROVAL → IDLE). Le flux aval reprend.",
        inputSchema: {
            type: 'object',
            properties: {
                node_id: { type: 'string', description: 'UUID du nœud humain à approuver' },
            },
            required: ['node_id'],
            additionalProperties: false,
        },
    },
    {
        name: 'reject_node',
        description: "Rejette un nœud HUMAN en attente avec un motif (→ ERROR). Le flux est stoppé.",
        inputSchema: {
            type: 'object',
            properties: {
                node_id: { type: 'string' },
                feedback: { type: 'string', description: 'Motif du rejet' },
            },
            required: ['node_id', 'feedback'],
            additionalProperties: false,
        },
    },
    {
        name: 'reset_node',
        description: "Ramène un nœud en ERROR à IDLE après correction.",
        inputSchema: {
            type: 'object',
            properties: {
                node_id: { type: 'string' },
            },
            required: ['node_id'],
            additionalProperties: false,
        },
    },
] as const;

export const SERVER_INFO = {
    name: 'organigrad-orchestrator',
    version: '0.1.0',
} as const;

export const PROTOCOL_VERSION = '2024-11-05';

// --- JSON-RPC types --------------------------------------------------------
// La requête entrante est typée `Record<string, unknown>` puis narrowée dans
// `dispatchMcpRequest` (corps non fiable) — pas d'interface d'entrée figée.

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

const ERROR_CODES = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    NODE_NOT_FOUND: -32001,
    ILLEGAL_TRANSITION: -32002,
    FORBIDDEN: -32003,
} as const;

// --- Dispatcher ------------------------------------------------------------

export interface McpDispatchContext {
    sql: Sql;
    workspaceId: string;
    apiKeyId?: string;
    scopes?: string[];
    mcpClient?: McpClient;
}

export async function dispatchMcpRequest(
    req: Record<string, unknown>,
    ctx: McpDispatchContext,
): Promise<JsonRpcResponse | null> {
    // Narrowing défensif du JSON-RPC entrant (corps non fiable) — sans cast forcé.
    const method = typeof req.method === 'string' ? req.method : '';
    const rawId = req.id;
    const id: string | number | null =
        typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null;
    // Notification (pas d'id) → pas de réponse
    const isNotification = rawId === undefined;

    try {
        switch (method) {
            case 'initialize':
                return reply(id, {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: SERVER_INFO,
                });

            case 'notifications/initialized':
                return null; // notification : no response

            case 'ping':
                return reply(id, {});

            case 'tools/list':
                return reply(id, { tools: TOOLS });

            case 'tools/call': {
                const params = req.params as { name?: string; arguments?: Record<string, unknown> };
                const name = params?.name;
                const args = params?.arguments ?? {};
                const result = await callTool(name, args, ctx);
                return reply(id, result);
            }

            default:
                if (isNotification) return null;
                return errorReply(id, ERROR_CODES.METHOD_NOT_FOUND, `Méthode inconnue : ${method}`);
        }
    } catch (err) {
        if (isNotification) return null;
        if (err instanceof MissingScopeError) {
            return errorReply(id, ERROR_CODES.FORBIDDEN, err.message, { required: err.required });
        }
        if (err instanceof NodeNotFoundError) {
            return errorReply(id, ERROR_CODES.NODE_NOT_FOUND, err.message, { nodeId: err.nodeId });
        }
        if (err instanceof IllegalTransitionError) {
            return errorReply(id, ERROR_CODES.ILLEGAL_TRANSITION, err.message, {
                from: err.from,
                to: err.to,
            });
        }
        const message = err instanceof Error ? err.message : String(err);
        return errorReply(id, ERROR_CODES.INTERNAL_ERROR, message);
    }
}

async function callTool(
    name: string | undefined,
    args: Record<string, unknown>,
    ctx: McpDispatchContext,
): Promise<unknown> {
    const store = new PgGraphStore(ctx.sql, ctx.workspaceId, {
        kind: 'api_key',
        id: ctx.apiKeyId,
    });
    const mcp = ctx.mcpClient ?? new McpClient({ timeoutMs: 30_000 });
    const engine = new OrchestrationEngine(store, mcp);

    switch (name) {
        case 'list_nodes': {
            assertScope(ctx.scopes, SCOPES.graphRead);
            const nodes = await store.list();
            return contentJson({ nodes: nodes.map(toPublicNodeDTO) });
        }

        case 'run_node': {
            assertScope(ctx.scopes, SCOPES.nodeRun);
            const id = requireString(args, 'node_id');
            await engine.runNode(id);
            return contentJson({ ok: true, node_id: id });
        }

        case 'approve_node': {
            // Validation humaine — refusée aux clés techniques (pas de scope human:approve).
            assertScope(ctx.scopes, SCOPES.humanApprove);
            const id = requireString(args, 'node_id');
            await store.applyTransition(id, 'IDLE');
            return contentJson({ ok: true, node_id: id, status: 'IDLE' });
        }

        case 'reject_node': {
            assertScope(ctx.scopes, SCOPES.humanReject);
            const id = requireString(args, 'node_id');
            const feedback = requireString(args, 'feedback');
            await store.applyTransition(id, 'ERROR', { feedback });
            return contentJson({ ok: true, node_id: id, status: 'ERROR' });
        }

        case 'reset_node': {
            assertScope(ctx.scopes, SCOPES.nodeReset);
            const id = requireString(args, 'node_id');
            await store.applyTransition(id, 'IDLE');
            return contentJson({ ok: true, node_id: id, status: 'IDLE' });
        }

        default:
            throw new Error(`Outil inconnu : ${String(name)}`);
    }
}

// --- Helpers ---------------------------------------------------------------

function reply(id: string | number | null, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
}

function errorReply(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

function contentJson(value: unknown) {
    return {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
    };
}

function requireString(args: Record<string, unknown>, key: string): string {
    const v = args[key];
    if (typeof v !== 'string' || v.trim() === '') {
        const err = new Error(`Paramètre "${key}" requis (string non vide).`);
        throw err;
    }
    return v;
}
