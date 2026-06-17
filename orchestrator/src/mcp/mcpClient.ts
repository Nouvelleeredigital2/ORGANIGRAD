import type { HybridNode } from '../domain/types.js';
import { safeFetch, SsrfError, type SsrfPolicy } from '../net/ssrfGuard.js';

/**
 * Client MCP — l'orchestrateur joue le rôle de client face aux serveurs MCP
 * exposés par les agents Hermes et par les logiciels-vérificateurs.
 *
 * Le transport HTTP (compatible MCP HTTP/SSE côté serveur) suffit pour la
 * Phase 1 : un POST JSON envoie le contexte du flux, la réponse contient un
 * tableau de blocs typés (`text`, `mcp_tool_result`, etc.).
 *
 * Principe imposé par le BRIEF : on parse les blocs par TYPE, jamais par
 * position. Si le serveur change l'ordre, le client continue de fonctionner.
 */

export interface RunContext {
    /** Identifiant de flux, propagé pour la traçabilité. */
    flowId?: string;
    /** Identifiants des nœuds amont déjà exécutés (chaîne précédente). */
    upstream?: string[];
    /** Livrable / payload produit par l'amont, transmis tel quel à l'agent. */
    upstreamPayload?: unknown;
}

export type RunResult =
    | { ok: true; output: unknown; text?: string }
    | { ok: false; error: string };

export interface McpClientOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** Politique SSRF (override). Par défaut : https + IP publiques en production. */
    ssrfPolicy?: SsrfPolicy;
    /** Taille maximale d'une réponse MCP (octets). Défaut : 2 Mo. */
    maxResponseBytes?: number;
}

interface McpBlockText {
    type: 'text';
    text: string;
}
interface McpBlockToolResult {
    type: 'mcp_tool_result';
    value: unknown;
}
type McpBlock = McpBlockText | McpBlockToolResult | { type: string; [k: string]: unknown };

interface McpResponseBody {
    result?: { content?: McpBlock[] };
}

export class McpClient {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;
    private readonly ssrfPolicy: SsrfPolicy;
    private readonly maxResponseBytes: number;

    constructor(opts: McpClientOptions = {}) {
        this.fetchImpl = opts.fetchImpl ?? fetch;
        this.timeoutMs = opts.timeoutMs ?? 30_000;
        this.ssrfPolicy = opts.ssrfPolicy ?? {};
        this.maxResponseBytes = opts.maxResponseBytes ?? 2_000_000;
    }

    async runNode(node: HybridNode, ctx: RunContext = {}): Promise<RunResult> {
        const url = node.mcpConfig?.serverUrl;
        if (!url) {
            return { ok: false, error: 'mcpConfig.serverUrl manquant sur le nœud' };
        }

        try {
            // safeFetch : protection SSRF + timeout + taille max + redirections contrôlées.
            const response = await safeFetch(
                url,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        nodeId: node.id,
                        nodeName: node.nom,
                        nodeType: node.type,
                        systemPrompt: node.systemPrompt,
                        skills: node.skills ?? [],
                        flow: ctx,
                    }),
                },
                { timeoutMs: this.timeoutMs, maxResponseBytes: this.maxResponseBytes, ...this.ssrfPolicy },
                { fetchImpl: this.fetchImpl },
            );

            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status} ${response.statusText}`.trim() };
            }

            const body = (await response.json()) as McpResponseBody;
            const blocks = body.result?.content ?? [];

            // Parse PAR TYPE, jamais par position
            const toolResult = blocks.find(
                (b): b is McpBlockToolResult => b.type === 'mcp_tool_result',
            );
            const texts = blocks
                .filter((b): b is McpBlockText => b.type === 'text')
                .map((b) => b.text)
                .join('\n');

            return {
                ok: true,
                output: toolResult ? toolResult.value : null,
                ...(texts ? { text: texts } : {}),
            };
        } catch (err) {
            if (err instanceof SsrfError) {
                // Cible refusée par la politique réseau ou timeout — message non sensible.
                const error =
                    err.reason === 'timeout'
                        ? `timeout (${this.timeoutMs}ms)`
                        : 'cible réseau MCP non autorisée';
                return { ok: false, error };
            }
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, error: msg };
        }
    }
}
