import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Outillage commun aux suites connectées.
 *
 * `playwright.connected.config.ts` charge `.env.connected` dans `process.env`
 * avant de lire ce module : les identifiants sont donc disponibles ici comme
 * côté navigateur.
 */

export const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
export const CLE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';

export interface Compte {
    email: string;
    motDePasse: string;
    workspaceId?: string;
}

/**
 * Lit un compte depuis `.env.connected`. Le suffixe distingue les comptes :
 * `''` → `E2E_EMAIL`, `'_B'` → `E2E_EMAIL_B`, etc.
 */
function compte(suffixe: string): Compte | null {
    const email = process.env[`E2E_EMAIL${suffixe}`];
    const motDePasse = process.env[`E2E_PASSWORD${suffixe}`];
    if (!email || !motDePasse) return null;
    const workspaceId = process.env[`E2E_WORKSPACE_ID${suffixe}`];
    return workspaceId ? { email, motDePasse, workspaceId } : { email, motDePasse };
}

/** Compte principal — requis par toutes les suites connectées. */
export const COMPTE_A = compte('');
/** Second compte, dans un AUTRE workspace — requis par les tests d'isolation. */
export const COMPTE_B = compte('_B');
/** Compte en lecture seule dans le workspace de A — facultatif. */
export const COMPTE_VIEWER = compte('_VIEWER');

export const CONFIGURE = Boolean(URL_SUPABASE && CLE_ANON && COMPTE_A);
export const ISOLATION_TESTABLE = Boolean(CONFIGURE && COMPTE_B);

/** Ouvre une session Supabase côté Node, pour préparer ou vérifier des données. */
export async function clientPour(c: Compte): Promise<SupabaseClient> {
    const client = createClient(URL_SUPABASE, CLE_ANON, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({
        email: c.email,
        password: c.motDePasse,
    });
    if (error) throw new Error(`connexion impossible pour ${c.email} : ${error.message}`);
    return client;
}

/**
 * Workspace ciblé pour un compte : celui indiqué dans `.env.connected`, sinon
 * le premier où il peut écrire.
 */
export async function workspaceDe(client: SupabaseClient, c: Compte): Promise<string> {
    if (c.workspaceId) return c.workspaceId;
    const { data, error } = await client
        .from('workspace_members')
        .select('workspace_id, role')
        .in('role', ['owner', 'admin', 'member'])
        .limit(1);
    if (error) throw new Error(`lecture des workspaces impossible : ${error.message}`);
    if (!data?.length) {
        throw new Error(`${c.email} n'est membre d'aucun workspace avec droit d'écriture`);
    }
    return data[0]!.workspace_id as string;
}

/** Connecte un compte dans le navigateur et attend l'application. */
export async function seConnecter(page: Page, c: Compte): Promise<void> {
    await page.goto('/');
    await page.getByLabel('Email').fill(c.email);
    await page.getByLabel('Mot de passe').fill(c.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 });
}

/**
 * Erreurs de console pertinentes. Le bruit sans rapport (favicon, extension)
 * ne doit pas faire échouer un test, mais toute exception non rattrapée, si.
 */
export function collecterErreurs(page: Page): string[] {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() === 'error') erreurs.push(`console.error: ${m.text()}`);
    });
    return erreurs;
}

export function erreursBloquantes(erreurs: string[]): string[] {
    return erreurs.filter((e) => e.startsWith('pageerror:'));
}
