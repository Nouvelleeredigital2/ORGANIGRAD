import { supabase } from '../lib/supabase';

export interface BotActivationCheck {
    code: string;
    label: string;
    passed: boolean;
}

export interface BotActivationStatus {
    botId?: string;
    enabled: boolean;
    ready: boolean;
    checks: BotActivationCheck[];
}

export interface BotActivationResult {
    status: 'activated' | 'draft';
    botId: string;
    actorId: string;
    verification?: BotActivationStatus;
}

function unavailable(): Error {
    return new Error('Une session OrganiGrad est requise pour vérifier ou activer un bot.');
}

function requireStatus(value: unknown): BotActivationStatus {
    if (!value || typeof value !== 'object') throw new Error('Réponse de vérification invalide.');
    return value as BotActivationStatus;
}

function requireResult(value: unknown): BotActivationResult {
    if (!value || typeof value !== 'object') throw new Error('Réponse d’activation invalide.');
    return value as BotActivationResult;
}

/** Ces RPC sont exécutées directement avec le JWT de la session humaine. */
export async function fetchBotActivation(botId: string): Promise<BotActivationStatus> {
    if (!supabase) throw unavailable();
    const { data, error } = await supabase.rpc('bot_activation_status', { p_bot_id: botId });
    if (error) throw error;
    return requireStatus(data);
}

export async function activateBot(botId: string): Promise<BotActivationResult> {
    if (!supabase) throw unavailable();
    const { data, error } = await supabase.rpc('activate_verified_bot', { p_bot_id: botId });
    if (error) throw error;
    return requireResult(data);
}

export async function deactivateBot(botId: string, reason: string): Promise<BotActivationResult> {
    if (!supabase) throw unavailable();
    const { data, error } = await supabase.rpc('deactivate_bot', { p_bot_id: botId, p_reason: reason });
    if (error) throw error;
    return requireResult(data);
}
