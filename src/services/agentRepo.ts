import { supabase } from '../lib/supabase';
import type { Agent, AgentSourceKind, GradeStyle } from '../types/agent';
import type { Database } from '../types/supabase';
import { agentStore } from './agentStore';

/**
 * Repository des fiches RH — backend Supabase si configuré ET workspace fourni,
 * sinon `agentStore` (localStorage cloisonné par workspace).
 *
 * Calqué sur `hybridNodeRepo` : même contrat de lecture explicite
 * (`source` / `stale` / `error`), pour que l'interface ne présente JAMAIS un
 * cache périmé comme la vérité courante.
 */

type Row = Database['public']['Tables']['org_agents']['Row'];
type Insert = Database['public']['Tables']['org_agents']['Insert'];

const GRADES: readonly GradeStyle[] = ['Direction', 'Responsable', 'Expert', 'Agent', 'Support'];

const toGradeStyle = (value: string): GradeStyle =>
    (GRADES as readonly string[]).includes(value) ? (value as GradeStyle) : 'Agent';

const toSourceKind = (value: string): AgentSourceKind =>
    value === 'import' || value === 'remote_csv' ? value : 'manual';

export class AgentConflictError extends Error {
    readonly agentId: string;
    readonly expectedUpdatedAt: string;

    constructor(agentId: string, expectedUpdatedAt: string) {
        super(`La fiche ${agentId} a été modifiée depuis son chargement`);
        this.name = 'AgentConflictError';
        this.agentId = agentId;
        this.expectedUpdatedAt = expectedUpdatedAt;
    }
}

export function rowToAgent(row: Row): Agent {
    return {
        id: row.id,
        updated_at: row.updated_at,
        nom: row.nom,
        prenom: row.prenom,
        fonction: row.fonction,
        titre: row.titre,
        service: row.service,
        pole: row.pole,
        rattachementId: row.rattachement_id,
        gradeStyle: toGradeStyle(row.grade_style),
        typeTemps: row.type_temps,
        ...(row.nbi ? { nbi: row.nbi } : {}),
        ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
        ...(row.email ? { email: row.email } : {}),
        ...(row.phone ? { phone: row.phone } : {}),
        externalKey: row.external_key,
        sourceKind: toSourceKind(row.source_kind),
        sourceRef: row.source_ref,
    };
}

export function agentToInsert(agent: Agent, workspaceId: string): Insert {
    return {
        id: agent.id,
        workspace_id: workspaceId,
        source_kind: agent.sourceKind ?? 'manual',
        source_ref: agent.sourceRef ?? '',
        external_key: agent.externalKey ?? agent.id,
        nom: agent.nom,
        prenom: agent.prenom,
        fonction: agent.fonction,
        titre: agent.titre,
        service: agent.service,
        pole: agent.pole,
        rattachement_id: agent.rattachementId,
        grade_style: agent.gradeStyle,
        type_temps: agent.typeTemps,
        nbi: agent.nbi ?? null,
        avatar_url: agent.avatarUrl ?? null,
        email: agent.email ?? null,
        phone: agent.phone ?? null,
    };
}

export interface AgentRepoContext {
    workspaceId: string | null;
}

export interface AgentListResult {
    agents: Agent[];
    source: 'supabase' | 'local';
    /** `true` ⇒ la lecture distante a échoué, on montre un cache. À signaler. */
    stale: boolean;
    error?: string;
}

export interface BulkUpsertOptions {
    sourceKind: AgentSourceKind;
    sourceRef: string;
    /** `replace` retire les fiches de LA MÊME source absentes de la charge. */
    mode: 'merge' | 'replace';
}

export interface BulkResult {
    inserted: number;
    updated: number;
    deleted: number;
}

/** Le mode local est nominal, pas dégradé : il n'y a rien à synchroniser. */
const isLocal = (ctx: AgentRepoContext): boolean => !supabase || !ctx.workspaceId;

export const agentRepo = {
    async list(ctx: AgentRepoContext): Promise<AgentListResult> {
        if (isLocal(ctx)) {
            return { agents: agentStore.list(ctx.workspaceId), source: 'local', stale: false };
        }

        const { data, error } = await supabase!
            .from('org_agents')
            .select('*')
            .eq('workspace_id', ctx.workspaceId!)
            .order('created_at', { ascending: true });

        if (error) {
            // On retombe sur le cache DU MÊME workspace, jamais un autre, et on
            // le signale : un cache présenté comme courant est un mensonge.
            return {
                agents: agentStore.list(ctx.workspaceId),
                source: 'local',
                stale: true,
                error: error.message,
            };
        }

        const agents = (data ?? []).map(rowToAgent);
        agentStore.save(ctx.workspaceId, agents);
        return { agents, source: 'supabase', stale: false };
    },

    async upsert(agent: Agent, ctx: AgentRepoContext): Promise<Agent> {
        if (isLocal(ctx)) {
            const current = agentStore.list(ctx.workspaceId);
            const idx = current.findIndex((a) => a.id === agent.id);
            const next = idx === -1 ? [...current, agent] : current.map((a, i) => (i === idx ? agent : a));
            agentStore.save(ctx.workspaceId, next);
            return agent;
        }

        const payload = agentToInsert(agent, ctx.workspaceId!);
        if (agent.updated_at) {
            const { data, error } = await supabase!
                .from('org_agents')
                .update(payload)
                .eq('id', agent.id)
                .eq('workspace_id', ctx.workspaceId!)
                .eq('updated_at', agent.updated_at)
                .select('*')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new AgentConflictError(agent.id, agent.updated_at);
            return rowToAgent(data);
        }

        const { data, error } = await supabase!
            .from('org_agents')
            .upsert(payload, { onConflict: 'id' })
            .select('*')
            .single();
        if (error) throw error;
        return rowToAgent(data);
    },

    /**
     * Import de masse, transactionnel côté serveur (RPC `import_org_agents`).
     *
     * En local, on émule la même sémantique : `replace` ne retire que les fiches
     * de LA MÊME source, jamais celles d'une autre.
     */
    async bulkUpsert(
        agents: Agent[],
        ctx: AgentRepoContext,
        opts: BulkUpsertOptions,
    ): Promise<BulkResult> {
        if (isLocal(ctx)) {
            const current = agentStore.list(ctx.workspaceId);
            const memeSource = (a: Agent) =>
                (a.sourceKind ?? 'manual') === opts.sourceKind && (a.sourceRef ?? '') === opts.sourceRef;

            const conserves = opts.mode === 'replace' ? current.filter((a) => !memeSource(a)) : current;
            const parCle = new Map(conserves.map((a) => [a.id, a]));
            let inserted = 0;
            let updated = 0;

            agents.forEach((a) => {
                if (parCle.has(a.id)) updated += 1;
                else inserted += 1;
                parCle.set(a.id, a);
            });

            agentStore.save(ctx.workspaceId, Array.from(parCle.values()));
            return {
                inserted,
                updated,
                deleted: opts.mode === 'replace' ? current.length - conserves.length : 0,
            };
        }

        const charge = agents.map((a) => ({
            external_key: a.externalKey ?? a.id,
            nom: a.nom,
            prenom: a.prenom,
            fonction: a.fonction,
            titre: a.titre,
            service: a.service,
            pole: a.pole,
            grade_style: a.gradeStyle,
            type_temps: a.typeTemps,
            nbi: a.nbi ?? null,
            avatar_url: a.avatarUrl ?? null,
            email: a.email ?? null,
            phone: a.phone ?? null,
            // Le rattachement est exprimé par clé métier : les identifiants
            // techniques n'existent pas encore côté client.
            rattachement_external_key: a.rattachementId ?? null,
        }));

        const { data, error } = await supabase!.rpc('import_org_agents', {
            p_workspace_id: ctx.workspaceId!,
            p_source_kind: opts.sourceKind,
            p_source_ref: opts.sourceRef,
            p_agents: charge,
            p_mode: opts.mode,
        });
        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as BulkResult | null;
        return row ?? { inserted: 0, updated: 0, deleted: 0 };
    },

    async remove(id: string, ctx: AgentRepoContext): Promise<void> {
        if (isLocal(ctx)) {
            const current = agentStore.list(ctx.workspaceId);
            // Adoption par le grand-parent — même règle que le trigger serveur,
            // pour que l'affichage soit identique avant et après confirmation.
            const supprime = current.find((a) => a.id === id);
            const next = current
                .filter((a) => a.id !== id)
                .map((a) =>
                    a.rattachementId === id
                        ? { ...a, rattachementId: supprime?.rattachementId ?? null }
                        : a,
                );
            agentStore.save(ctx.workspaceId, next);
            return;
        }

        const { error } = await supabase!
            .from('org_agents')
            .delete()
            .eq('id', id)
            .eq('workspace_id', ctx.workspaceId!);
        if (error) throw error;
    },

    /** Vide les fiches RH du workspace courant. */
    async clearWorkspace(ctx: AgentRepoContext): Promise<number> {
        if (isLocal(ctx)) {
            const compte = agentStore.list(ctx.workspaceId).length;
            agentStore.reset(ctx.workspaceId);
            return compte;
        }

        const { data, error } = await supabase!
            .from('org_agents')
            .delete()
            .eq('workspace_id', ctx.workspaceId!)
            .select('id');
        if (error) throw error;
        agentStore.reset(ctx.workspaceId);
        return (data ?? []).length;
    },
};
