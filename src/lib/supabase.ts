import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

/**
 * Client Supabase partagé — utilise les variables d'environnement Vite.
 *
 * Si elles manquent (build local sans .env), `supabase` reste `null` et l'app
 * bascule en mode offline / fallback localStorage (cf. hybridNodeStore).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured: boolean = Boolean(url && key);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
    ? createClient<Database>(url!, key!, {
          auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storageKey: 'organigrad-auth',
          },
      })
    : null;
