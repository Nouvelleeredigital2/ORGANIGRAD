import { test, expect } from '@playwright/test';

/**
 * E2E — import en deux temps.
 *
 * `previewImport` / `commitImport` existaient depuis longtemps sans qu'aucune
 * interface ne les appelle : le fichier était appliqué directement, sans
 * déduplication, sans rapport et sans confirmation. Ce parcours vérifie la
 * chaîne complète : prévisualisation → confirmation → organigramme → survie au
 * rafraîchissement.
 *
 * Tourne hors Supabase (.env.test) : la persistance est donc `agentStore`,
 * cloisonné dans l'espace `local`.
 */

const CSV = [
    'Pôle / Direction,Service / Secteur,Nom,Prénom,Poste / Fonction',
    'TECHNIQUE,Voirie,DUPONT,Jean,Directeur',
    'TECHNIQUE,Voirie,MARTIN,Claire,Agent',
    // Doublon strict de la ligne précédente : doit être détecté, pas importé.
    'TECHNIQUE,Voirie,MARTIN,Claire,Agent',
    ',,,,',
].join('\n');

async function importer(page: import('@playwright/test').Page) {
    await page.goto('/?v=settings');
    await expect(page.getByRole('heading', { name: /Paramètres\./i })).toBeVisible();

    // Deux entrées de fichier coexistent (Topbar + Paramètres) ; on vise celle
    // de la vue Paramètres, visible.
    await page.locator('input[type="file"]:visible').setInputFiles({
        name: 'annuaire-test.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(CSV, 'utf-8'),
    });
}

test('la prévisualisation rapporte doublons et lignes invalides avant tout import', async ({ page }) => {
    await importer(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('annuaire-test.csv')).toBeVisible();
    await expect(dialog.getByText(/Doublons ignorés/i)).toBeVisible();
    await expect(dialog.getByText(/Lignes invalides/i)).toBeVisible();

    // Rien n'est appliqué tant que l'utilisateur n'a pas confirmé.
    await dialog.getByRole('button', { name: /Annuler/i }).click();
    await expect(dialog).toBeHidden();
});

test("confirmer l'import alimente l'organigramme et survit au rafraîchissement", async ({ page }) => {
    await importer(page);

    const dialog = page.getByRole('dialog');
    // Les lignes invalides bloquent tant qu'on ne les accepte pas explicitement.
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: /Importer 2 fiches/i }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(/DUPONT/).first()).toBeVisible();

    // La donnée est persistée : elle ne disparaît plus au rafraîchissement.
    await page.reload();
    await expect(page.getByText(/DUPONT/).first()).toBeVisible();
});
