import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Hook session Supabase — single source of truth pour l'auth UI.
 * - `loading` true tant que la session initiale n'est pas chargée
 * - `session` null si non connecté ou Supabase non configuré
 */
export function useSession(): { session: Session | null; loading: boolean } {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(isSupabaseConfigured);

    useEffect(() => {
        // `loading` est initialisé à `isSupabaseConfigured` : si Supabase n'est pas
        // configuré, il vaut déjà `false` — aucun setState synchrone nécessaire.
        if (!supabase) return;
        let active = true;
        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (active) {
                    setSession(data.session);
                    setLoading(false);
                }
            })
            .catch(() => active && setLoading(false));

        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
            setSession(next);
        });
        return () => {
            active = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    return { session, loading };
}
