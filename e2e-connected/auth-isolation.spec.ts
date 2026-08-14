import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    COMPTE_A,
    COMPTE_B,
    COMPTE_VIEWER,
    CONFIGURE,
    ISOLATION_TESTABLE,
    clientPour,
    collecterErreurs,
    erreursBloquantes,
    seConnecter,
    workspaceDe,
} from './_helpers';

/**
 * P1-7 — authentification, rôles et isolation entre workspaces, contre un
 * Supabase réel.
 *
 * C'est la seule suite capable de vérifier l'isolation de bout en bout : en
 * mode hermétique, `isLocalMode` rend tout permis et aucun rôle n'existe. Les
 * tests SQL (`workspaceRpcSecurity`) prouvent que la base refuse ; ceux-ci
 * prouvent que l'application, telle qu'un utilisateur la manipule, refuse aussi.
 */

test.describe('Authentification', () => {
    test.skip(!CONFIGURE, '.env.connected non renseigné — voir .env.connected.example');

    test('connexion puis déconnexion', async ({ page }) => {
        const erreurs = collecterErreurs(page);
        await seConnecter(page, COMPTE_A!);

        await page.getByRole('navigation').getByRole('button', { name: /Déconnexion|Se déconnecter/i }).click();
        // Retour à l'écran d'authentification : le formulaire réapparaît.
        await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
            timeout: 15_000,
        });
        expect(erreursBloquantes(erreurs), erreurs.join('\n')).toEqual([]);
    });

    test('un mot de passe erroné est refusé, en français', async ({ page }) => {
        await page.goto('/');
        await page.getByLabel('Email').fill(COMPTE_A!.email);
        await page.getByLabel('Mot de passe').fill('mot-de-passe-volontairement-faux');
        await page.getByRole('button', { name: 'Se connecter' }).click();

        // Le message traduit (cf. src/components/auth/authErrors.ts), pas le
        // texte Supabase d'origine.
        await expect(page.getByText(/E-mail ou mot de passe incorrect/i)).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByText(/Invalid login credentials/i)).toHaveCount(0);
    });

    test('la session survit à un rechargement', async ({ page }) => {
        await seConnecter(page, COMPTE_A!);
        await page.reload();
        await expect(page.getByRole('navigation')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('button', { name: 'Se connecter' })).toHaveCount(0);
    });
});

test.describe('Isolation entre workspaces', () => {
    test.skip(
        !ISOLATION_TESTABLE,
        "E2E_EMAIL_B / E2E_PASSWORD_B absents — l'isolation ne se teste pas avec un seul compte",
    );

    let clientA: SupabaseClient;
    let clientB: SupabaseClient;
    let wsA: string;
    let wsB: string;
    const nodesCrees: Array<[SupabaseClient, string]> = [];

    test.beforeAll(async () => {
        clientA = await clientPour(COMPTE_A!);
        clientB = await clientPour(COMPTE_B!);
        wsA = await workspaceDe(clientA, COMPTE_A!);
        wsB = await workspaceDe(clientB, COMPTE_B!);

        // Garde-fou : deux comptes pointant le même workspace ne testeraient
        // rien, et tous les tests ci-dessous passeraient pour de mauvaises
        // raisons.
        expect(wsA, 'les comptes A et B doivent être dans DEUX workspaces distincts').not.toBe(wsB);
    });

    test.afterAll(async () => {
        for (const [client, id] of nodesCrees) {
            await client.from('hybrid_nodes').delete().eq('id', id);
        }
        await clientA?.auth.signOut();
        await clientB?.auth.signOut();
    });

    test("B ne lit aucun nœud du workspace de A", async () => {
        const nom = `Isolation ${Date.now()}`;
        const { data, error } = await clientA
            .from('hybrid_nodes')
            .insert({
                workspace_id: wsA,
                type: 'AGENT_IA',
                nom,
                role_titre: 'test isolation',
                grade_id: 'Expert',
                status: 'IDLE',
            })
            .select('id')
            .single();
        expect(error, `insertion refusée pour A : ${error?.message}`).toBeNull();
        nodesCrees.push([clientA, data!.id as string]);

        // A le voit…
        const vuA = await clientA.from('hybrid_nodes').select('id').eq('id', data!.id);
        expect(vuA.data).toHaveLength(1);

        // … B ne le voit pas. La RLS ne renvoie pas d'erreur : elle renvoie
        // zéro ligne. Un test qui n'attendrait qu'une erreur passerait à côté.
        const vuB = await clientB.from('hybrid_nodes').select('id').eq('id', data!.id);
        expect(vuB.error).toBeNull();
        expect(vuB.data).toHaveLength(0);
    });

    test("B ne peut pas écrire dans le workspace de A", async () => {
        const { error } = await clientB.from('hybrid_nodes').insert({
            workspace_id: wsA,
            type: 'AGENT_IA',
            nom: 'Intrusion',
            role_titre: 'ne doit pas exister',
            grade_id: 'Expert',
            status: 'IDLE',
        });
        expect(error, "l'insertion de B dans le workspace de A aurait dû être refusée").not.toBeNull();
    });

    test("B ne peut pas créer de clé API dans le workspace de A (la faille corrigée)", async () => {
        const { error } = await clientB.rpc('create_workspace_api_key', {
            p_workspace_id: wsA,
            p_name: 'cle-volee-e2e',
        });
        expect(error, 'un non-membre a obtenu une clé API — la faille est ouverte').not.toBeNull();
        expect(error!.message).toMatch(/forbidden/i);

        // Et surtout : aucune ligne créée. Un refus qui écrit quand même n'est
        // pas un refus.
        const restes = await clientA
            .from('workspace_api_keys')
            .select('id')
            .eq('workspace_id', wsA)
            .eq('name', 'cle-volee-e2e');
        expect(restes.data ?? []).toHaveLength(0);
    });

    test("B ne peut pas inviter dans le workspace de A", async () => {
        const { error } = await clientB.rpc('invite_workspace_member', {
            p_workspace_id: wsA,
            p_email: 'intrus-e2e@invalid',
        });
        expect(error, 'un non-membre a créé une invitation').not.toBeNull();
        expect(error!.message).toMatch(/forbidden/i);
    });

    test("dans le navigateur, B ne voit pas les nœuds de A", async ({ page }) => {
        const nom = `Isolation UI ${Date.now()}`;
        const { data } = await clientA
            .from('hybrid_nodes')
            .insert({
                workspace_id: wsA,
                type: 'AGENT_IA',
                nom,
                role_titre: 'test isolation UI',
                grade_id: 'Expert',
                status: 'IDLE',
            })
            .select('id')
            .single();
        if (data) nodesCrees.push([clientA, data.id as string]);

        await seConnecter(page, COMPTE_B!);
        await page.goto('/?v=orchestration');
        await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
        await expect(page.getByText(nom)).toHaveCount(0);
    });
});

test.describe('Rôle en lecture seule', () => {
    test.skip(!COMPTE_VIEWER, 'E2E_EMAIL_VIEWER absent — rôle viewer non testé');

    test("un viewer n'obtient aucune commande d'administration", async ({ page }) => {
        await seConnecter(page, COMPTE_VIEWER!);

        // Les vues restent ADRESSABLES — le routeur ne connaît pas les rôles.
        // Ce qui compte, c'est qu'elles n'offrent rien.
        await page.goto('/?v=members');
        await expect(page.getByText(/ne permet pas d'inviter/i)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('button', { name: /^Inviter$/ })).toHaveCount(0);

        await page.goto('/?v=api-keys');
        await expect(page.getByText(/ne permet pas de consulter/i)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('button', { name: /Créer la clé/i })).toHaveCount(0);
    });

    test('?edit=1 ne donne pas le mode édition à un viewer', async ({ page }) => {
        await seConnecter(page, COMPTE_VIEWER!);
        await page.goto('/?edit=1');
        await expect(page.getByRole('navigation')).toBeVisible();

        // Le bouton de suppression n'apparaît qu'en mode édition effectif.
        await expect(page.getByRole('button', { name: /Supprimer|Retirer la fiche/i })).toHaveCount(0);
    });
});
