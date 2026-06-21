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
import type { OrchestratorClient } from './orchestratorService';

/**
 * Sentinelle renvoyée quand un champ est chiffré côté serveur — la SPA
 * ne peut pas le déchiffrer (pas de clé). L'UI doit afficher un indicateur
 * "Configuré (chiffré)" et permettre une mise à jour sans montrer la valeur.
 */
export const ENCRYPTED_PLACEHOLDER = '__encrypted__' as const;

function maskEncryptedField<T>(v: T | string | null | undefined): T | typeof ENCRYPTED_PLACEHOLDER | null | undefined {
    if (typeof v === 'string' && v.startsWith('enc:v1:')) return ENCRYPTED_PLACEHOLDER;
    return v as T | null | undefined;
}

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
    // Champs potentiellement chiffrés par l'orchestrateur : si la valeur commence
    // par `enc:v1:`, on la remplace par la sentinelle — la SPA n'a pas la clé.
    const rawPrompt = row.system_prompt ?? undefined;
    const systemPrompt = rawPrompt !== undefined ? (maskEncryptedField(rawPrompt) ?? undefined) : undefined;

    const rawMcp = (row.mcp_config as McpConfig | null) ?? undefined;
    const mcpRaw = rawMcp !== undefined ? maskEncryptedField(rawMcp) : undefined;
    const mcpConfig = mcpRaw === ENCRYPTED_PLACEHOLDER ? undefined : (mcpRaw as McpConfig | undefined);

    const rawNotif = (row.notification_channels as NotificationChannels | null) ?? undefined;
    const notifRaw = rawNotif !== undefined ? maskEncryptedField(rawNotif) : undefined;
    const notificationChannels = notifRaw === ENCRYPTED_PLACEHOLDER ? undefined : (notifRaw as NotificationChannels | undefined);

    return {
        id: row.id,
        type: row.type as NodeType,
        nom: row.nom,
        roleTitre: row.role_titre,
        parentID: row.parent_id,
        gradeId: row.grade_id,
        systemPrompt: systemPrompt === ENCRYPTED_PLACEHOLDER ? ENCRYPTED_PLACEHOLDER : systemPrompt,
        skills: row.skills,
        mcpConfig,
        notificationChannels,
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
    /**
     * Si fourni, les écritures (upsert/remove) passent par l'orchestrateur
     * (qui chiffre les secrets avant stockage). La lecture reste via Supabase.
     */
    orchestratorClient?: OrchestratorClient | null;
}

/**
 * Résultat de `list` — expose explicitement l'origine et la fraîcheur des
 * données pour que l'UI ne présente JAMAIS un cache périmé comme courant
 * (Priorité 3). `stale: true` ⇒ la lecture distante a échoué et on retombe sur
 * le cache local du MÊME workspace : l'UI doit le signaler.
 */
export interface ListResult {
    nodes: HybridNode[];
    source: 'supabase' | 'local';
    stale: boolean;
    error?: string;
}

export const hybridNodeRepo = {
    async list({ workspaceId }: RepoContext): Promise<ListResult> {
        if (!supabase || !workspaceId) {
            return { nodes: hybridNodeStore.list(workspaceId), source: 'local', stale: false };
        }
        const { data, error } = await supabase
            .from('hybrid_nodes')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: true });
        if (error) {
            // Erreur réseau : on retombe sur le cache local DU MÊME workspace,
            // mais on le signale comme périmé (stale) — pas de fausse fraîcheur.
            console.warn('[hybridNodeRepo] list failed, fallback local (stale):', error.message);
            return {
                nodes: hybridNodeStore.list(workspaceId),
                source: 'local',
                stale: true,
                error: error.message,
            };
        }
        const list = (data ?? []).map(rowToNode);
        // Synchronise le cache local NAMESPACÉ pour le fallback offline.
        hybridNodeStore.save(workspaceId, list);
        return { nodes: list, source: 'supabase', stale: false };
    },

    async upsert(node: HybridNode, ctx: RepoContext): Promise<HybridNode> {
        // Chemin orchestrateur : chiffrement côté serveur (audit #1).
        if (ctx.orchestratorClient && ctx.workspaceId) {
            const dto = await ctx.orchestratorClient.upsertNode(
                {
                    id: node.id,
                    type: node.type,
                    nom: node.nom,
                    roleTitre: node.roleTitre,
                    parentID: node.parentID,
                    gradeId: node.gradeId,
                    systemPrompt: node.systemPrompt !== ENCRYPTED_PLACEHOLDER ? (node.systemPrompt ?? null) : null,
                    skills: node.skills,
                    mcpConfig: node.mcpConfig ?? null,
                    notificationChannels: node.notificationChannels ?? null,
                    avatarUrl: node.avatarUrl ?? null,
                },
                ctx.workspaceId,
            );
            // Le DTO retourné n'a pas les secrets (indicateurs seulement) — on
            // reconstitue un HybridNode minimal pour la mise à jour du cache local.
            const merged: HybridNode = {
                ...node,
                status: dto.status,
            };
            hybridNodeStore.save(ctx.workspaceId, [
                ...hybridNodeStore.list(ctx.workspaceId).filter((n) => n.id !== node.id),
                merged,
            ]);
            return merged;
        }

        if (!supabase || !ctx.workspaceId) {
            const current = hybridNodeStore.list(ctx.workspaceId);
            const idx = current.findIndex((n) => n.id === node.id);
            const next = idx === -1 ? [...current, node] : current.map((n, i) => (i === idx ? node : n));
            hybridNodeStore.save(ctx.workspaceId, next);
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
        // Chemin orchestrateur : suppression via API sécurisée (audit #1).
        if (ctx.orchestratorClient && ctx.workspaceId) {
            await ctx.orchestratorClient.removeNode(id);
            hybridNodeStore.save(
                ctx.workspaceId,
                hybridNodeStore.list(ctx.workspaceId).filter((n) => n.id !== id),
            );
            return;
        }

        if (!supabase || !ctx.workspaceId) {
            hybridNodeStore.save(
                ctx.workspaceId,
                hybridNodeStore.list(ctx.workspaceId).filter((n) => n.id !== id),
            );
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
