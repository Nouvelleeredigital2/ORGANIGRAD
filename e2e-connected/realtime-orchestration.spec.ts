import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * P0-5 — Realtime avec DEUX consommateurs, contre un Supabase réel.
 *
 * Le crash d'origine (recette connectée 2026-08-11) ne se reproduit qu'avec un
 * vrai client Realtime : `supabase.channel(topic)` renvoie l'instance existante,
 * et un second `.on('postgres_changes', …)` sur un channel déjà souscrit lève
 * depuis le cœur de supabase-js — hors de toute frontière React, donc page
 * blanche. Un mock complaisant ne le montre pas ; c'est pourquoi ce test existe
 * en plus des tests unitaires de `realtimeShared.ts`.
 *
 * `OrchestrationView` et `ActivityLog` s'abonnent tous deux au même workspace :
 * ouvrir la vue Orchestration suffit à mettre les deux en présence.
 *
 * **Critère d'acceptation (plan P0-5) : aucune exception Realtime non gérée
 * dans la console.** C'est ce que vérifie `sansErreurNonGeree`.
 *
 * Ne s'exécute que si `.env.connected` est renseigné — voir
 * `.env.connected.example` et `playwright.connected.config.ts`.
 */

const URL_SUPABASE = process.env.VITE_SUPABASE_URL;
const CLE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_EMAIL;
const MOT_DE_PASSE = process.env.E2E_PASSWORD;

const CONFIGURE = Boolean(URL_SUPABASE && CLE_ANON && EMAIL && MOT_DE_PASSE);

/**
 * Erreurs collectées côté navigateur. On capture les exceptions non rattrapées
 * ET les rejets de promesse : le crash d'origine passait par la seconde voie.
 */
function collecterErreurs(page: Page) {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error') erreurs.push(`console.error: ${msg.text()}`);
    });
    return erreurs;
}

/**
 * Les erreurs attendues et sans rapport avec Realtime (bruit réseau, favicon)
 * ne doivent pas faire échouer le test — mais tout ce qui touche au canal, si.
 */
function sansErreurNonGeree(erreurs: string[]) {
    return erreurs.filter(
        (e) =>
            /realtime|channel|postgres_changes|subscribe/i.test(e) ||
            /pageerror/.test(e),
    );
}

async function seConnecter(page: Page) {
    await page.goto('/');
    await page.getByLabel('Email').fill(EMAIL!);
    await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE!);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    // La barre de navigation n'apparaît qu'une fois la session établie.
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 });
}

test.describe('Realtime — Orchestration + Journal d\'activité (Supabase réel)', () => {
    test.skip(!CONFIGURE, '.env.connected non renseigné — voir .env.connected.example');

    let client: SupabaseClient;
    let workspaceId: string;
    const nodesCrees: string[] = [];

    test.beforeAll(async () => {
        client = createClient(URL_SUPABASE!, CLE_ANON!);
        const { error } = await client.auth.signInWithPassword({
            email: EMAIL!,
            password: MOT_DE_PASSE!,
        });
        if (error) throw new Error(`connexion du client de test impossible : ${error.message}`);

        if (process.env.E2E_WORKSPACE_ID) {
            workspaceId = process.env.E2E_WORKSPACE_ID;
        } else {
            const { data, error: err } = await client
                .from('workspace_members')
                .select('workspace_id, role')
                .in('role', ['owner', 'admin', 'member'])
                .limit(1);
            if (err) throw new Error(`lecture des workspaces impossible : ${err.message}`);
            if (!data?.length) {
                throw new Error(
                    "le compte de test n'est membre d'aucun workspace avec droit d'écriture",
                );
            }
            workspaceId = data[0]!.workspace_id as string;
        }
    });

    test.afterAll(async () => {
        // Ces tests écrivent dans un vrai projet : ne rien laisser derrière.
        if (nodesCrees.length) {
            await client.from('hybrid_nodes').delete().in('id', nodesCrees);
        }
        await client?.auth.signOut();
    });

    test('ouvrir Orchestration avec le Journal monté ne fait pas tomber la SPA', async ({ page }) => {
        const erreurs = collecterErreurs(page);
        await seConnecter(page);

        await page.goto('/?v=orchestration');

        // Les DEUX consommateurs sont montés sur le même workspace : c'est
        // exactement la situation qui produisait la page blanche.
        await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
        await expect(page.getByText(/Journal d'activité/i)).toBeVisible();

        // Laisse le temps aux deux souscriptions de s'établir.
        await page.waitForTimeout(3_000);

        expect(sansErreurNonGeree(erreurs), erreurs.join('\n')).toEqual([]);
        // Pas de page blanche : la coquille applicative répond encore.
        await expect(page.getByRole('navigation')).toBeVisible();
    });

    test('un nœud créé hors navigateur remonte en direct dans les deux vues', async ({ page }) => {
        const erreurs = collecterErreurs(page);
        await seConnecter(page);
        await page.goto('/?v=orchestration');
        await expect(page.getByText(/Journal d'activité/i)).toBeVisible();

        // Le badge « Live » n'apparaît qu'une fois le canal des transitions
        // réellement SUBSCRIBED : on attend l'abonnement plutôt qu'un délai
        // arbitraire, sinon l'événement peut précéder la souscription.
        await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 20_000 });

        // Écriture faite DEPUIS NODE, pas par l'interface : seul le chemin
        // Realtime peut faire apparaître le nœud à l'écran. Une création via
        // l'UI passerait par la mise à jour optimiste et ne prouverait rien.
        const nom = `E2E Realtime ${Date.now()}`;
        const { data, error } = await client
            .from('hybrid_nodes')
            .insert({
                workspace_id: workspaceId,
                type: 'AGENT_IA',
                nom,
                role_titre: 'Nœud de vérification P0-5',
                grade_id: 'Expert',
                status: 'IDLE',
            })
            .select('id')
            .single();
        expect(error, `insertion refusée : ${error?.message}`).toBeNull();
        nodesCrees.push(data!.id as string);

        // 1. La vue Orchestration reflète le nouveau nœud.
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });

        // 2. Le journal a enregistré l'événement.
        await expect(
            page.getByText(new RegExp(nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).first(),
        ).toBeVisible({ timeout: 20_000 });

        // 3. Aucune exception Realtime non gérée — le critère d'acceptation.
        expect(sansErreurNonGeree(erreurs), erreurs.join('\n')).toEqual([]);
    });

    test('naviguer en boucle vers Orchestration ne rebranche pas le canal', async ({ page }) => {
        // Démontage/remontage répétés : `removeChannel` est asynchrone, et un
        // remontage rapide retombait sur l'instance déjà souscrite.
        const erreurs = collecterErreurs(page);
        await seConnecter(page);

        for (let i = 0; i < 5; i++) {
            await page.goto('/?v=orchestration');
            await expect(page.getByText(/Journal d'activité/i)).toBeVisible();
            await page.goto('/?v=dashboard');
            await expect(page.getByRole('navigation')).toBeVisible();
        }

        await page.goto('/?v=orchestration');
        await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
        expect(sansErreurNonGeree(erreurs), erreurs.join('\n')).toEqual([]);
    });
});
