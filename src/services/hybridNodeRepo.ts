import { supabase } from '../lib/supabase';
import type {
    HybridNode,
    NodeType,
    NodeStatus,
    McpConfig,
    NotificationChannels,
} from '../types/hybridNode';
import type { Database } from '../types/supabase';
import { hybridNodeStore } from './hybridNodeStore';

type Row = Database['public']['Tables']['hybrid_nodes']['Row'];
type Insert = Database['public']['Tables']['hybrid_nodes']['Insert'];

/**
 * Repository HybridNode — backend Supabase si configuré + workspace fourni,
 * sinon fallback `hybridNodeStore` (localStorage, mode offline / non-authed).
 *
 * Mapping camelCase <-> snake_case. Le statut côté DB est `text` ; on le caste
 * vers NodeStatus dans les bornes du type union.
 */

function rowToNode(row: Row): HybridNode {
    return {
        id: row.id,
        type: row.type as NodeType,
        nom: row.nom,
        roleTitre: row.role_titre,
        parentID: row.parent_id,
        gradeId: row.grade_id,
        systemPrompt: row.system_prompt ?? undefined,
        skills: row.skills,
        mcpConfig: (row.mcp_config as McpConfig | null) ?? undefined,
        notificationChannels:
            (row.notification_channels as NotificationChannels | null) ?? undefined,
        avatarUrl: row.avatar_url ?? undefined,
        status: row.status as NodeStatus,
    };
}

function nodeToInsert(node: HybridNode, workspaceId: string): Insert {
    return {
        id: node.id,
        workspace_id: workspaceId,
        type: node.type,
        nom: node.nom,
        role_titre: node.roleTitre,
        parent_id: node.parentID,
        grade_id: node.gradeId,
        system_prompt: node.systemPrompt ?? null,
        skills: node.skills ?? [],
        mcp_config: (node.mcpConfig ?? null) as import('../types/supabase').Json | null,
        notification_channels: (node.notificationChannels ?? null) as import('../types/supabase').Json | null,
        avatar_url: node.avatarUrl ?? null,
        status: node.status,
    };
}

export interface RepoContext {
    workspaceId: string | null;
}

export const hybridNodeRepo = {
    async list({ workspaceId }: RepoContext): Promise<HybridNode[]> {
        if (!supabase || !workspaceId) {
            return hybridNodeStore.list();
        }
        const { data, error } = await supabase
            .from('hybrid_nodes')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: true });
        if (error) {
            // En cas d'erreur réseau, on retombe sur le cache local
            console.warn('[hybridNodeRepo] list failed, fallback local:', error.message);
            return hybridNodeStore.list();
        }
        const list = (data ?? []).map(rowToNode);
        // Synchronise le cache local pour fallback
        hybridNodeStore.save(list);
        return list;
    },

    async upsert(node: HybridNode, ctx: RepoContext): Promise<HybridNode> {
        if (!supabase || !ctx.workspaceId) {
            const current = hybridNodeStore.list();
            const idx = current.findIndex((n) => n.id === node.id);
            const next = idx === -1 ? [...current, node] : current.map((n, i) => (i === idx ? node : n));
            hybridNodeStore.save(next);
            return node;
        }
        const payload = nodeToInsert(node, ctx.workspaceId);
        const { data, error } = await supabase
            .from('hybrid_nodes')
            .upsert(payload, { onConflict: 'id' })
            .select('*')
            .single();
        if (error) throw error;
        return rowToNode(data);
    },

    async remove(id: string, ctx: RepoContext): Promise<void> {
        if (!supabase || !ctx.workspaceId) {
            hybridNodeStore.save(hybridNodeStore.list().filter((n) => n.id !== id));
            return;
        }
        const { error } = await supabase
            .from('hybrid_nodes')
            .delete()
            .eq('id', id)
            .eq('workspace_id', ctx.workspaceId);
        if (error) throw error;
    },

    /**
     * Souscrit aux changements live (Realtime Postgres) pour un workspace.
     * Renvoie une fonction de cleanup.
     */
    subscribe(
        ctx: RepoContext,
        handler: (event: 'INSERT' | 'UPDATE' | 'DELETE', node: HybridNode | { id: string }) => void,
    ): () => void {
        if (!supabase || !ctx.workspaceId) return () => {};
        const channel = supabase
            .channel(`hybrid_nodes:${ctx.workspaceId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'hybrid_nodes',
                    filter: `workspace_id=eq.${ctx.workspaceId}`,
                },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        handler('DELETE', { id: (payload.old as Row).id });
                    } else {
                        handler(
                            payload.eventType as 'INSERT' | 'UPDATE',
                            rowToNode(payload.new as Row),
                        );
                    }
                },
            )
            .subscribe();
        return () => {
            void supabase?.removeChannel(channel);
        };
    },
};
