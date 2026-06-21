import postgres, { type Sql } from 'postgres';
import { transition, type NodeStatus } from '../domain/stateMachine.js';
import type { HybridNode, JsonObject, McpConfig, NotificationChannels, NodeType } from '../domain/types.js';
import { type GraphStore, type TransitionEvent } from './graphStore.js';
import type { SecretCipher } from '../security/crypto.js';
import { decryptText, decryptJson, encryptText, encryptJson } from '../security/nodeSecrets.js';

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
    mcp_config: unknown;
    notification_channels: unknown;
    avatar_url: string | null;
    status: NodeStatus;
}

export class PgGraphStore implements GraphStore {
    private listeners = new Set<TransitionListener>();

    constructor(
        private readonly sql: Sql,
        private readonly workspaceId: string,
        private readonly actor: { kind: 'user' | 'api_key' | 'orchestrator'; id?: string } = {
            kind: 'orchestrator',
        },
        private readonly cipher: SecretCipher | null = null,
    ) {}

    /** Déchiffre les champs sensibles d'une ligne DB vers HybridNode. */
    private rowToNode(r: DbRow): HybridNode {
        return {
            id: r.id,
            type: r.type,
            nom: r.nom,
            roleTitre: r.role_titre,
            parentID: r.parent_id,
            gradeId: r.grade_id,
            systemPrompt: decryptText(this.cipher, r.system_prompt) ?? undefined,
            skills: r.skills,
            mcpConfig: decryptJson<McpConfig>(this.cipher, r.mcp_config) ?? undefined,
            notificationChannels: decryptJson<NotificationChannels>(this.cipher, r.notification_channels) ?? undefined,
            avatarUrl: r.avatar_url ?? undefined,
            status: r.status,
        };
    }

    /** Charge tous les nœuds du workspace. */
    async list(): Promise<readonly HybridNode[]> {
        const rows = await this.sql<DbRow[]>`
            select * from public.hybrid_nodes
             where workspace_id = ${this.workspaceId}
             order by created_at asc
        `;
        return rows.map((r) => this.rowToNode(r));
    }

    async get(id: string): Promise<HybridNode> {
        const rows = await this.sql<DbRow[]>`
            select * from public.hybrid_nodes
             where workspace_id = ${this.workspaceId} and id = ${id}
             limit 1
        `;
        const row = rows[0];
        if (!row) throw new NodeNotFoundError(id);
        return this.rowToNode(row);
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
     * Crée ou met à jour un nœud. Chiffre les champs sensibles avant stockage.
     * Le `status` est TOUJOURS forcé à IDLE à la création ; la machine à états
     * interdit de créer un nœud dans un état autre que IDLE.
     */
    async upsertNode(node: HybridNode): Promise<HybridNode> {
        const encPrompt = encryptText(this.cipher, node.systemPrompt ?? null);
        const encMcp = encryptJson(this.cipher, node.mcpConfig ?? null) as JsonObject | null;
        const encNotif = encryptJson(this.cipher, node.notificationChannels ?? null) as JsonObject | null;

        const rows = await this.sql<DbRow[]>`
            insert into public.hybrid_nodes
                (id, workspace_id, type, nom, role_titre, parent_id, grade_id,
                 system_prompt, skills, mcp_config, notification_channels, avatar_url, status)
            values
                (${node.id}, ${this.workspaceId}, ${node.type}, ${node.nom}, ${node.roleTitre},
                 ${node.parentID ?? null}, ${node.gradeId},
                 ${encPrompt ?? null},
                 ${this.sql.array(node.skills ?? [])},
                 ${encMcp != null ? this.sql.json(encMcp) : null},
                 ${encNotif != null ? this.sql.json(encNotif) : null},
                 ${node.avatarUrl ?? null},
                 'IDLE')
            on conflict (id) do update set
                type                  = excluded.type,
                nom                   = excluded.nom,
                role_titre            = excluded.role_titre,
                parent_id             = excluded.parent_id,
                grade_id              = excluded.grade_id,
                system_prompt         = excluded.system_prompt,
                skills                = excluded.skills,
                mcp_config            = excluded.mcp_config,
                notification_channels = excluded.notification_channels,
                avatar_url            = excluded.avatar_url,
                updated_at            = now()
            where public.hybrid_nodes.workspace_id = ${this.workspaceId}
            returning *
        `;
        const row = rows[0];
        if (!row) throw new NodeNotFoundError(node.id);
        return this.rowToNode(row);
    }

    /** Supprime un nœud du workspace. */
    async deleteNode(id: string): Promise<void> {
        await this.sql`
            delete from public.hybrid_nodes
             where workspace_id = ${this.workspaceId} and id = ${id}
        `;
    }

    /**
     * Mute le statut d'un nœud après validation par la machine à états.
     * Transaction : UPDATE + INSERT transition en un coup.
     */
    async applyTransition(
        nodeId: string,
        to: NodeStatus,
        payload?: JsonObject,
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
                     ${payload ? this.sql.json(payload) : null},
                     ${this.actor.kind}, ${this.actor.id ?? null})
            `;

            const updated: HybridNode = this.rowToNode({ ...row, status: nextStatus });

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
