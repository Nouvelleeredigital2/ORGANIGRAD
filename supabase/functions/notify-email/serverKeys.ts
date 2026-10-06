export interface NotifyEmailServerKeys {
    adminKey: string;
    callerKeys: Set<string>;
}

/**
 * Résout les clés serveur sans jamais journaliser leur valeur.
 * `SUPABASE_SECRET_KEYS` est le JSON injecté par Supabase pour les nouvelles
 * clés `sb_secret_…`. La clé legacy reste acceptée pendant la coexistence.
 */
export function resolveNotifyEmailServerKeys(
    env: Record<string, string | undefined>,
): NotifyEmailServerKeys | null {
    const callerKeys = new Set<string>();
    let preferred = '';
    const encoded = env.SUPABASE_SECRET_KEYS?.trim();
    if (encoded) {
        try {
            const parsed = JSON.parse(encoded) as unknown;
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
            for (const value of Object.values(parsed as Record<string, unknown>)) {
                if (typeof value !== 'string' || !value.trim()) continue;
                const key = value.trim();
                callerKeys.add(key);
                preferred ||= key;
            }
        } catch {
            return null;
        }
    }

    const legacy = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
    if (legacy) callerKeys.add(legacy);
    const adminKey = preferred || legacy;
    return adminKey && callerKeys.size ? { adminKey, callerKeys } : null;
}

export function notifyEmailCallerKey(headers: Headers): string {
    const apiKey = headers.get('apikey')?.trim();
    if (apiKey) return apiKey;
    return (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}
