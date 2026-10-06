import { describe, expect, it } from 'vitest';
import {
    notifyEmailCallerKey,
    resolveNotifyEmailServerKeys,
} from './serverKeys.ts';

describe('notify-email — rotation des clés serveur', () => {
    it('préfère une nouvelle clé et accepte les deux clés pendant la coexistence', () => {
        const keys = resolveNotifyEmailServerKeys({
            SUPABASE_SECRET_KEYS: JSON.stringify({ orchestrator: 'sb_secret_new' }),
            SUPABASE_SERVICE_ROLE_KEY: 'legacy',
        });
        expect(keys?.adminKey).toBe('sb_secret_new');
        expect(keys?.callerKeys).toEqual(new Set(['sb_secret_new', 'legacy']));
    });

    it('échoue fermé si le JSON des nouvelles clés est invalide', () => {
        expect(resolveNotifyEmailServerKeys({
            SUPABASE_SECRET_KEYS: '{invalid',
            SUPABASE_SERVICE_ROLE_KEY: 'legacy',
        })).toBeNull();
    });

    it('lit apikey puis Bearer legacy', () => {
        expect(notifyEmailCallerKey(new Headers({ apikey: 'sb_secret_new' }))).toBe('sb_secret_new');
        expect(notifyEmailCallerKey(new Headers({ authorization: 'Bearer legacy' }))).toBe('legacy');
    });
});
