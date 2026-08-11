import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
    HybridNode,
    NodeType,
    NodeStatus,
    McpConfig,
    NotificationChannels,
} from '../types/hybridNode';
import type { Database } from '../types/supabase';
import { hybridNodeStore } from './hybridNodeStore';
import type { NodeMutationPayload, OrchestratorClient } from './orchestratorService';

/**
 * Registre module-level des channels Realtime actifs, un par workspace —
 * voir la jsdoc de `hybridNodeRepo.subscribe` pour la raison d'être.
 */
const realtimeSubscriptions = new Map<
    string,
    {
        channel: RealtimeChannel;
        handlers: Set<
            (event: 'INSERT' | 'UPDATE' | 'DELETE', node: HybridNode | { id: string }) => void
        >;
    }
>();

/**
 * Préfixe posé par l'orchestrateur sur une valeur chiffrée au repos.
 *
 * Détail interne du mapping : un champ chiffré n'est PAS transformé en valeur
 * factice, il est laissé `undefined` et signalé par `node.encrypted`. Faire
 * circuler une sentinelle jusqu'à l'interface avait une conséquence grave :
 * l'éditeur l'affichait comme une valeur ordinaire puis la réécrivait en base,
 * détruisant le secret.
 */
const ENCRYPTED_PREFIX = 'enc:v1:';

const isEncrypted = (v: unknown): boolean => typeof v === 'string' && v.startsWith(ENCRYPTED_PREFIX);

type Row = Database['public']['Tables']['hybrid_nodes']['Row'];
type Insert = Database['public']['Tables']['hybrid_nodes']['Insert'];

/**
 * Repository HybridNode — backend Supabase si configuré + workspace fourni,
 * sinon fallback `hybridNodeStore` (localStorage, mode offline / non-authed).
 *
 * Mapping camelCase <-> snake_case. Le statut côté DB est `text` ; on le caste
 * vers NodeStatus dans les bornes du type union.
 */

/** Exporté pour les tests : c'est ici que se joue la survie des secrets. */
export function rowToNode(row: Row): HybridNode {
    // Un champ chiffré est signalé, jamais matérialisé : la valeur reste
    // `undefined` pour qu'aucun code d'interface ne puisse la réécrire.
    const promptEncrypted = isEncrypted(row.system_prompt);
    const mcpEncrypted = isEncrypted(row.mcp_config);
    const notifEncrypted = isEncrypted(row.notification_channels);

    const encrypted: HybridNode['encrypted'] =
        promptEncrypted || mcpEncrypted || notifEncrypted
            ? {
                  ...(promptEncrypted ? { systemPrompt: true } : {}),
                  ...(mcpEncrypted ? { mcpConfig: true } : {}),
                  ...(notifEncrypted ? { notificationChannels: true } : {}),
              }
            : undefined;

    return {
        id: row.id,
        type: row.type as NodeType,
        nom: row.nom,
        roleTitre: row.role_titre,
        parentID: row.parent_id,
        gradeId: row.grade_id,
        systemPrompt: promptEncrypted ? undefined : (row.system_prompt ?? undefined),
        skills: row.skills,
        mcpConfig: mcpEncrypted ? undefined : ((row.mcp_config as McpConfig | null) ?? undefined),
        notificationChannels: notifEncrypted
            ? undefined
            : ((row.notification_channels as NotificationChannels | null) ?? undefined),
        avatarUrl: row.avatar_url ?? undefined,
        status: row.status as NodeStatus,
        ...(encrypted ? { encrypted } : {}),
    };
}

/**
 * Construit la charge d'écriture Supabase.
 *
 * OMISSION = CONSERVATION : une colonne absente de la charge n'est pas touchée
 * par l'`upsert` PostgREST sur une ligne existante. C'est ainsi qu'un champ
 * chiffré non remplacé survit à un enregistrement.
 */
export function nodeToInsert(node: HybridNode, workspaceId: string): Insert {
    const base: Insert = {
        id: node.id,
        workspace_id: workspaceId,
        type: node.type,
        nom: node.nom,
        role_titre: node.roleTitre,
        parent_id: node.parentID,
        grade_id: node.gradeId,
        skills: node.skills ?? [],
        avatar_url: node.avatarUrl ?? null,
        status: node.status,
    };

    if (!node.encrypted?.systemPrompt) {
        base.system_prompt = node.systemPrompt ?? null;
    }
    if (!node.encrypted?.mcpConfig) {
        base.mcp_config = (node.mcpConfig ?? null) as import('../types/supabase').Json | null;
    }
    if (!node.encrypted?.notificationChannels) {
        base.notification_channels = (node.notificationChannels ??
            null) as import('../types/supabase').Json | null;
    }

    return base;
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
            // Même règle que côté Supabase : une propriété omise est conservée
            // par le serveur (cf. validateNodeMutation), un `null` efface.
            const payload: NodeMutationPayload = {
                id: node.id,
                type: node.type,
                nom: node.nom,
                roleTitre: node.roleTitre,
                parentID: node.parentID,
                gradeId: node.gradeId,
                skills: node.skills,
                avatarUrl: node.avatarUrl ?? null,
            };
            if (!node.encrypted?.systemPrompt) {
                payload.systemPrompt = node.systemPrompt ?? null;
            }
            if (!node.encrypted?.mcpConfig) {
                payload.mcpConfig = node.mcpConfig ?? null;
            }
            if (!node.encrypted?.notificationChannels) {
                payload.notificationChannels = node.notificationChannels ?? null;
            }

            const dto = await ctx.orchestratorClient.upsertNode(payload, ctx.workspaceId);
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
     *
     * Mutualisé par workspace : ActivityLog et OrchestrationView s'abonnent
     * tous deux au même workspace en parallèle. `supabase.channel(topic)`
     * renvoie l'instance EXISTANTE pour un topic déjà présent — un second
     * appel à `.on('postgres_changes', …)` sur un channel déjà `.subscribe()`
     * lève une exception non rattrapable (crash de toute l'app, constaté en
     * recette connectée 2026-08-11 : ouvrir Orchestration avec ActivityLog
     * déjà monté faisait planter la SPA). Un seul channel/dispatcher par
     * workspace, un Set de handlers en aval — comptage de références pour
     * fermer le channel quand le dernier abonné se retire.
     */
    subscribe(
        ctx: RepoContext,
        handler: (event: 'INSERT' | 'UPDATE' | 'DELETE', node: HybridNode | { id: string }) => void,
    ): () => void {
        if (!supabase || !ctx.workspaceId) return () => {};
        const workspaceId = ctx.workspaceId;

        let entry = realtimeSubscriptions.get(workspaceId);
        if (!entry) {
            const handlers = new Set<typeof handler>();
            const channel = supabase
                .channel(`hybrid_nodes:${workspaceId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'hybrid_nodes',
                        filter: `workspace_id=eq.${workspaceId}`,
                    },
                    (payload) => {
                        const dispatched: ['INSERT' | 'UPDATE' | 'DELETE', HybridNode | { id: string }] =
                            payload.eventType === 'DELETE'
                                ? ['DELETE', { id: (payload.old as Row).id }]
                                : [payload.eventType as 'INSERT' | 'UPDATE', rowToNode(payload.new as Row)];
                        for (const h of handlers) h(...dispatched);
                    },
                )
                .subscribe();
            entry = { channel, handlers };
            realtimeSubscriptions.set(workspaceId, entry);
        }
        entry.handlers.add(handler);

        return () => {
            const current = realtimeSubscriptions.get(workspaceId);
            if (!current) return;
            current.handlers.delete(handler);
            if (current.handlers.size === 0) {
                realtimeSubscriptions.delete(workspaceId);
                void supabase?.removeChannel(current.channel);
            }
        };
    },
};
