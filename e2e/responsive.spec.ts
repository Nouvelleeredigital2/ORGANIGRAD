import { test, expect } from '@playwright/test';

/**
 * E2E responsive — vérifie que la vue Orchestration fonctionne sur viewport mobile.
 * Utilise un viewport mobile manuel (375×812) avec Chromium pour rester compatible.
 */

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

test('Mobile · le drawer Sidebar s\'ouvre via le hamburger', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    const hamburger = page.getByRole('button', { name: /Ouvrir le menu/i });
    await expect(hamburger).toBeVisible();
    const navOrch = page.getByRole('navigation').getByRole('button', { name: 'Orchestration' });
    await expect(navOrch).toBeHidden();
    await hamburger.click();
    await expect(navOrch).toBeVisible();
    await navOrch.click();
    await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
});

test('Mobile · le scénario reste utilisable (fixture)', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.addInitScript(() => {
        window.localStorage.setItem(
            'organigrad_hybrid_nodes_v1',
            JSON.stringify([
                { id: 'ia-m', type: 'AGENT_IA', nom: 'IA', roleTitre: 'r', parentID: null, gradeId: 'E', status: 'IDLE' },
                { id: 'hum-m', type: 'HUMAN', nom: 'H', roleTitre: 'g', parentID: 'ia-m', gradeId: 'D', status: 'IDLE' },
            ]),
        );
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Ouvrir le menu/i }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Orchestration' }).click();
    await page.getByRole('button', { name: /Lancer la chaîne/i }).click();
    await expect(page.getByRole('button', { name: /Valider/ })).toBeVisible({ timeout: 6000 });
});

test('Mobile · le modal NodeEditor est atteignable en scroll', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.getByRole('button', { name: /Ouvrir le menu/i }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Orchestration' }).click();
    // App vierge → bouton "Créer le premier nœud" plutôt que "Nouveau nœud"
    const createTrigger = page.getByRole('button', { name: /(Nouveau nœud|Créer le premier nœud)/i });
    await createTrigger.first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const createBtn = page.getByRole('button', { name: /^Créer$/ });
    await createBtn.scrollIntoViewIfNeeded();
    await expect(createBtn).toBeVisible();
});

test('Desktop · le hamburger est masqué et la sidebar est statique', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Ouvrir le menu/i })).toBeHidden();
    await expect(
        page.getByRole('navigation').getByRole('button', { name: 'Orchestration' }),
    ).toBeVisible();
});
