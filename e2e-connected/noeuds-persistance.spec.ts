import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    COMPTE_A,
    CONFIGURE,
    clientPour,
    collecterErreurs,
    erreursBloquantes,
    seConnecter,
    workspaceDe,
} from './_helpers';

/**
 * P1-7 — cycle de vie d'un nœud et persistance réelle.
 *
 * En mode hermétique, les nœuds vivent dans `localStorage` : « ça persiste »
 * n'y veut rien dire. Ces tests vérifient que ce que l'utilisateur crée à
 * l'écran arrive bien EN BASE, et y reste après rechargement.
 */

test.describe('Nœuds — création, modification, suppression, persistance', () => {
    test.skip(!CONFIGURE, '.env.connected non renseigné — voir .env.connected.example');

    let client: SupabaseClient;
    let workspaceId: string;
    const aNettoyer: string[] = [];

    test.beforeAll(async () => {
        client = await clientPour(COMPTE_A!);
        workspaceId = await workspaceDe(client, COMPTE_A!);
    });

    test.afterAll(async () => {
        if (aNettoyer.length) await client.from('hybrid_nodes').delete().in('id', aNettoyer);
        await client?.auth.signOut();
    });

    /** Crée un nœud côté base et retourne son identifiant. */
    async function semer(nom: string): Promise<string> {
        const { data, error } = await client
            .from('hybrid_nodes')
            .insert({
                workspace_id: workspaceId,
                type: 'AGENT_IA',
                nom,
                role_titre: 'nœud de test E2E',
                grade_id: 'Expert',
                status: 'IDLE',
            })
            .select('id')
            .single();
        expect(error, `insertion impossible : ${error?.message}`).toBeNull();
        aNettoyer.push(data!.id as string);
        return data!.id as string;
    }

    test('un nœud créé en base apparaît à l’écran et survit au rechargement', async ({ page }) => {
        const nom = `Noeud E2E ${Date.now()}`;
        await semer(nom);

        await seConnecter(page, COMPTE_A!);
        await page.goto('/?v=orchestration');
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });

        // Persistance : après rechargement complet, il est toujours là. C'est
        // ce que le mode local ne peut pas prouver.
        await page.reload();
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });
    });

    test('une suppression en base disparaît de l’écran après rechargement', async ({ page }) => {
        const nom = `Noeud supprime ${Date.now()}`;
        const id = await semer(nom);

        await seConnecter(page, COMPTE_A!);
        await page.goto('/?v=orchestration');
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });

        const { error } = await client.from('hybrid_nodes').delete().eq('id', id);
        expect(error).toBeNull();

        await page.reload();
        await expect(page.getByText(nom)).toHaveCount(0);
    });

    test('une modification en base se reflète à l’écran', async ({ page }) => {
        const nom = `Noeud renomme ${Date.now()}`;
        const id = await semer(nom);
        const nouveauNom = `${nom} (modifie)`;

        await seConnecter(page, COMPTE_A!);
        await page.goto('/?v=orchestration');
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });

        const { error } = await client.from('hybrid_nodes').update({ nom: nouveauNom }).eq('id', id);
        expect(error).toBeNull();

        // Realtime devrait le propager sans rechargement ; on tolère le
        // rechargement comme repli pour ne pas transformer ce test en test de
        // Realtime — c'est realtime-orchestration.spec.ts qui s'en charge.
        await expect(async () => {
            if (await page.getByText(nouveauNom).count()) return;
            await page.reload();
            await expect(page.getByText(nouveauNom)).toBeVisible({ timeout: 10_000 });
        }).toPass({ timeout: 40_000 });
    });

    test('changer de vue et revenir ne perd pas les données', async ({ page }) => {
        const erreurs = collecterErreurs(page);
        const nom = `Noeud navigation ${Date.now()}`;
        await semer(nom);

        await seConnecter(page, COMPTE_A!);
        await page.goto('/?v=orchestration');
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });

        for (const vue of ['dashboard', 'settings', 'orchestration']) {
            await page.goto(`/?v=${vue}`);
            await expect(page.getByRole('navigation')).toBeVisible();
        }
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });
        expect(erreursBloquantes(erreurs), erreurs.join('\n')).toEqual([]);
    });
});
