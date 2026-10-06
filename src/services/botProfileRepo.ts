import { supabase } from '../lib/supabase';
import type { BotFamily, BotModelSettings, BotProfile, BotSource } from '../types/botProfile';
import type { Database } from '../types/supabase';
import type { BotBundle } from './orchestratorService';

type BotProfileRow = Database['public']['Tables']['bot_profiles']['Row'];

function toSources(value: unknown): BotSource[] {
    return Array.isArray(value) ? value.filter((item): item is BotSource =>
        Boolean(item) && typeof item === 'object' && typeof (item as BotSource).label === 'string' && typeof (item as BotSource).url === 'string',
    ) : [];
}

function toModel(value: unknown): BotModelSettings {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as BotModelSettings : {};
}

export function mapBotProfile(row: BotProfileRow): BotProfile {
    return {
        id: row.id,
        updated_at: row.updated_at,
        runtimeId: row.runtime_id,
        fileName: row.file_name,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        family: row.family as BotFamily,
        brand: row.brand,
        network: row.network,
        telegramUsername: row.telegram_username,
        mission: row.mission,
        personality: row.personality,
        research: row.research,
        watch: row.watch,
        deliverables: row.deliverables,
        method: row.method,
        limits: row.limits,
        usefulContext: row.useful_context,
        sources: toSources(row.sources),
        model: toModel(row.model),
        enabled: row.enabled,
        compiledPrompt: row.compiled_prompt,
        compiledSha256: row.compiled_sha256,
    };
}

/**
 * Lecture RLS directe des fiches : elle garde la revue d'activation utilisable
 * quand le moteur local n'est pas disponible. Les écritures restent portées par
 * l'orchestrateur et les RPC d'activation dédiées.
 */
export async function fetchBotProfiles(workspaceId: string | null): Promise<BotProfile[]> {
    if (!supabase) throw new Error('Une session OrganiGrad est requise pour lire les bots.');
    let query = supabase.from('bot_profiles').select('*');
    if (workspaceId) query = query.eq('workspace_id', workspaceId);
    const { data, error } = await query.order('display_name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapBotProfile);
}

/** Même format que l'API Hermes, sans transport ni écriture distante. */
export function buildBotBundle(profiles: readonly BotProfile[]): BotBundle {
    const files: BotBundle['files'] = {};
    for (const profile of profiles) {
        if (!profile.enabled) continue;
        files[profile.fileName] = {
            agent: profile.runtimeId,
            content: profile.compiledPrompt,
            sha256: profile.compiledSha256,
        };
    }
    return { files };
}
