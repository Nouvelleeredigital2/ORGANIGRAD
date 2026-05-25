import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import type { NodeStatus } from '../types/hybridNode';

/**
 * Repository des transitions de nœuds (audit trail).
 *
 * Lit `node_transitions` filtrées par workspace et expose un abonnement
 * Realtime. Utilisé par `ActivityLog` pour afficher en live ce qui se passe
 * sur le graphe — y compris les transitions générées par l'orchestrateur
 * backend et par d'autres onglets/utilisateurs du même workspace.
 */

type Row = Database['public']['Tables']['node_transitions']['Row'];

export interface TransitionRecord {
    id: string;
    nodeId: string;
    from: NodeStatus;
    to: NodeStatus;
    actorKind: 'user' | 'api_key' | 'orchestrator';
    actorId: string | null;
    payload: Record<string, unknown> | null;
    timestamp: number;
}

function rowToRecord(r: Row): TransitionRecord {
    return {
        id: r.id,
        nodeId: r.node_id,
        from: r.from_status as NodeStatus,
        to: r.to_status as NodeStatus,
        actorKind: r.actor_kind,
        actorId: r.actor_id,
        payload: (r.payload as Record<string, unknown> | null) ?? null,
        timestamp: new Date(r.created_at).getTime(),
    };
}

export const transitionsRepo = {
    /** Renvoie les N transitions les plus récentes du workspace. */
    async listRecent(workspaceId: string, limit = 30): Promise<TransitionRecord[]> {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('node_transitions')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) {
            console.warn('[transitionsRepo] listRecent failed:', error.message);
            return [];
        }
        return (data ?? []).map(rowToRecord);
    },

    /**
     * S'abonne en Realtime aux nouvelles transitions du workspace.
     * Renvoie une fonction de cleanup.
     */
    subscribe(workspaceId: string, onInsert: (rec: TransitionRecord) => void): () => void {
        if (!supabase) return () => {};
        const channel = supabase
            .channel(`node_transitions:${workspaceId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'node_transitions',
                    filter: `workspace_id=eq.${workspaceId}`,
                },
                (payload) => onInsert(rowToRecord(payload.new as Row)),
            )
            .subscribe();
        return () => {
            void supabase?.removeChannel(channel);
        };
    },
};
