import { test, expect } from '@playwright/test';

/**
 * E2E — navigation adressable.
 *
 * Vérifie que l'URL est bien la source de vérité : lien profond, survie au
 * rafraîchissement, et bouton Précédent du navigateur.
 */

test('un lien profond ouvre directement la bonne vue', async ({ page }) => {
    await page.goto('/?v=orchestration');
    await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
});

test("naviguer met l'URL à jour et le rafraîchissement conserve la vue", async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Paramètres' }).click();
    await expect(page.getByRole('heading', { name: /Paramètres\./i })).toBeVisible();
    await expect(page).toHaveURL(/[?&]v=settings/);

    await page.reload();
    await expect(page.getByRole('heading', { name: /Paramètres\./i })).toBeVisible();
});

test('le bouton Précédent revient à la vue précédente', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Orchestration' }).click();
    await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();

    await page.getByRole('navigation').getByRole('button', { name: 'Paramètres' }).click();
    await expect(page.getByRole('heading', { name: /Paramètres\./i })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
});

/**
 * Le flux d'invitation lit `?invite=` au chargement : la navigation ne doit
 * jamais l'effacer, sinon l'invité perd son jeton en changeant de vue.
 */
test("la navigation préserve un paramètre étranger", async ({ page }) => {
    await page.goto('/?utm_source=e2e');
    await page.getByRole('navigation').getByRole('button', { name: 'Orchestration' }).click();
    await expect(page).toHaveURL(/utm_source=e2e/);
    await expect(page).toHaveURL(/[?&]v=orchestration/);
});
