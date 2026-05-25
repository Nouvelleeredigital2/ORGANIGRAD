import postgres, { type Sql } from 'postgres';
import { transition, type NodeStatus } from '../domain/stateMachine.js';
import type { HybridNode, NodeType } from '../domain/types.js';
import { type TransitionEvent } from './graphStore.js';

/**
 * GraphStore Postgres-backed — alternative pour la production.
 *
 * Garde la MÊME API que `GraphStore` in-memory (load/list/get/applyTransition,
 * onTransition) pour rester drop-in compatible avec l'`OrchestrationEngine`.
 *
 * Toute mutation passe par `applyTransition()` qui :
 *   1. Vérifie la transition via la machine à états (refuse sans muter)
 *   2. UPDATE `hybrid_nodes` ... where workspace_id = $ws and id = $node
 *   3. INSERT dans `node_transitions` (audit)
 *   4. Notifie les listeners locaux (alimente le SSE)
 *
 * Le store est SCOPÉ par workspace : une instance = un workspace. L'API HTTP
 * crée/cache une instance par requête à partir du `workspace_id` résolu de la
 * clé API.
 */

export class NodeNotFoundError extends Error {
    constructor(public readonly nodeId: string) {
        super(`Nœud introuvable : ${nodeId}`);
        this.name = 'NodeNotFoundError';
    }
}

type TransitionListener = (evt: TransitionEvent) => void;

interface DbRow {
    id: string;
    workspace_id: string;
    type: NodeType;
    nom: string;
    role_titre: string;
    parent_id: string | null;
    grade_id: string;
    system_prompt: string | null;
    skills: string[];
    mcp_config: { serverUrl: string; connectedTo: string[] } | null;
    notification_channels: Record<string, string> | null;
    avatar_url: string | null;
    status: NodeStatus;
}

function rowToNode(r: DbRow): HybridNode {
    return {
        id: r.id,
        type: r.type,
        nom: r.nom,
        roleTitre: r.role_titre,
        parentID: r.parent_id,
        gradeId: r.grade_id,
        systemPrompt: r.system_prompt ?? undefined,
        skills: r.skills,
        mcpConfig: r.mcp_config ?? undefined,
        notificationChannels: r.notification_channels ?? undefined,
        avatarUrl: r.avatar_url ?? undefined,
        status: r.status,
    };
}

export class PgGraphStore {
    private listeners = new Set<TransitionListener>();

    constructor(
        private readonly sql: Sql,
        private readonly workspaceId: string,
        private readonly actor: { kind: 'user' | 'api_key' | 'orchestrator'; id?: string } = {
            kind: 'orchestrator',
        },
    ) {}

    /** Charge tous les nœuds du workspace. */
    async list(): Promise<readonly HybridNode[]> {
        const rows = await this.sql<DbRow[]>`
            select * from public.hybrid_nodes
             where workspace_id = ${this.workspaceId}
             order by created_at asc
        `;
        return rows.map(rowToNode);
    }

    async get(id: string): Promise<HybridNode> {
        const rows = await this.sql<DbRow[]>`
            select * from public.hybrid_nodes
             where workspace_id = ${this.workspaceId} and id = ${id}
             limit 1
        `;
        const row = rows[0];
        if (!row) throw new NodeNotFoundError(id);
        return rowToNode(row);
    }

    async has(id: string): Promise<boolean> {
        const rows = await this.sql<{ exists: boolean }[]>`
            select exists(
                select 1 from public.hybrid_nodes
                 where workspace_id = ${this.workspaceId} and id = ${id}
            ) as exists
        `;
        return rows[0]?.exists ?? false;
    }

    /**
     * Mute le statut d'un nœud après validation par la machine à états.
     * Transaction : UPDATE + INSERT transition en un coup.
     */
    async applyTransition(
        nodeId: string,
        to: NodeStatus,
        payload?: Record<string, unknown>,
    ): Promise<HybridNode> {
        return this.sql.begin(async (tx) => {
            const before = await tx<DbRow[]>`
                select * from public.hybrid_nodes
                 where workspace_id = ${this.workspaceId} and id = ${nodeId}
                 for update
            `;
            const row = before[0];
            if (!row) throw new NodeNotFoundError(nodeId);

            const from = row.status;
            const nextStatus = transition(from, to); // throw IllegalTransitionError si refusé

            await tx`
                update public.hybrid_nodes
                   set status = ${nextStatus}, updated_at = now()
                 where workspace_id = ${this.workspaceId} and id = ${nodeId}
            `;

            await tx`
                insert into public.node_transitions
                    (workspace_id, node_id, from_status, to_status, payload, actor_kind, actor_id)
                values
                    (${this.workspaceId}, ${nodeId}, ${from}, ${nextStatus},
                     ${payload ? this.sql.json(payload as never) : null},
                     ${this.actor.kind}, ${this.actor.id ?? null})
            `;

            const updated: HybridNode = rowToNode({ ...row, status: nextStatus });

            const evt: TransitionEvent = {
                nodeId,
                from,
                to: nextStatus,
                timestamp: Date.now(),
                payload,
                nodeSnapshot: { ...updated },
            };
            for (const fn of this.listeners) fn(evt);

            return updated;
        });
    }

    onTransition(listener: TransitionListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

/** Crée un client postgres partagé (singleton) à partir du DATABASE_URL. */
let _sql: Sql | null = null;
export function getSql(): Sql {
    if (_sql) return _sql;
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
        throw new Error(
            'SUPABASE_DB_URL non défini — connection string Postgres requise (service_role).',
        );
    }
    _sql = postgres(url, {
        prepare: true,
        max: 10,
        idle_timeout: 30,
        connect_timeout: 10,
    });
    return _sql;
}
