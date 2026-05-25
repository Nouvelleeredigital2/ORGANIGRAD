import { test, expect, type Page } from '@playwright/test';

/**
 * E2E — vue Orchestration Hybride.
 * L'app démarre VIERGE (plus de seed). Les tests qui ont besoin de nœuds les
 * sèment eux-mêmes via `localStorage` avant le `goto`.
 */

const STORAGE_KEY = 'organigrad_hybrid_nodes_v1';

const FIXTURE = [
    {
        id: 'ia-1',
        type: 'AGENT_IA',
        nom: 'Rédacteur',
        roleTitre: 'Génère textes',
        parentID: null,
        gradeId: 'Expert',
        skills: ['rag', 'image-gen', 'web-search'],
        systemPrompt: 'Tu es un rédacteur expert.',
        status: 'IDLE',
    },
    {
        id: 'mcp-1',
        type: 'SOFTWARE_MCP',
        nom: 'Brand-Guard',
        roleTitre: 'Vérif. couleurs',
        parentID: 'ia-1',
        gradeId: 'Support',
        skills: ['hex-validate'],
        mcpConfig: { serverUrl: 'mcp://brand.local', connectedTo: ['ia-1'] },
        status: 'IDLE',
    },
    {
        id: 'hum-1',
        type: 'HUMAN',
        nom: 'Validateur',
        roleTitre: 'Garant',
        parentID: 'mcp-1',
        gradeId: 'Direction',
        notificationChannels: { email: 'val@example.org' },
        status: 'IDLE',
    },
];

async function gotoOrchestration(page: Page) {
    await page.goto('/');
    // Cible STRICTEMENT le bouton nav (pas le brand "Orchestration hybride")
    await page.getByRole('navigation').getByRole('button', { name: 'Orchestration' }).click();
    await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
}

async function seedAndGoto(page: Page, nodes: unknown = FIXTURE) {
    await page.addInitScript(
        ({ key, data }) => {
            window.localStorage.setItem(key, JSON.stringify(data));
        },
        { key: STORAGE_KEY, data: nodes },
    );
    await gotoOrchestration(page);
}

test('démarre vierge — affiche l\'état vide et "Lancer la chaîne" désactivé', async ({
    page,
}) => {
    await page.addInitScript((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await gotoOrchestration(page);
    await expect(page.getByText(/Aucun nœud dans la chaîne/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Créer le premier nœud/i })).toBeVisible();
    const launch = page.getByRole('button', { name: /Lancer la chaîne/i });
    await expect(launch).toBeDisabled();
});

test('avec fixture : rend les 3 archétypes', async ({ page }) => {
    await seedAndGoto(page);
    await expect(page.getByRole('heading', { name: 'Rédacteur' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Brand-Guard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Validateur' })).toBeVisible();
});

test('"Lancer la chaîne" fait transiter et déclenche la validation', async ({ page }) => {
    await seedAndGoto(page);
    await page.getByRole('button', { name: /Lancer la chaîne/i }).click();
    await expect(page.getByRole('button', { name: /Valider/ })).toBeVisible({ timeout: 8000 });
});

test('Validation Center : approuver ferme le panneau', async ({ page }) => {
    await seedAndGoto(page);
    await page.getByRole('button', { name: /Lancer la chaîne/i }).click();
    await page.getByRole('button', { name: /Valider/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Centre de validation/i)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /^Valider$/i }).first().click();
    await expect(page.getByRole('dialog')).toBeHidden();
});

test('NodeEditor : créer un nouveau nœud IA', async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await gotoOrchestration(page);
    await page.getByRole('button', { name: /Créer le premier nœud/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByPlaceholder('Rédacteur Campagne').fill('Rédacteur E2E');
    await page.getByPlaceholder('Génère textes & visuels').fill('Test Playwright');
    await page.getByPlaceholder('rag, web-search, image-gen').fill('rag, e2e');
    await page.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Rédacteur E2E' })).toBeVisible();
});

test('Échap ferme l\'éditeur', async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await gotoOrchestration(page);
    await page.getByRole('button', { name: /Créer le premier nœud/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
});

test('Ctrl+K focus le Spotlight', async ({ page }) => {
    await gotoOrchestration(page);
    await page.keyboard.press('Control+k');
    const focused = page.locator('input:focus');
    await expect(focused).toHaveAttribute('placeholder', /Rechercher/);
});

test('Spotlight : recherche par skill', async ({ page }) => {
    await seedAndGoto(page);
    const input = page.getByPlaceholder(/Rechercher un nœud, un skill/);
    await input.fill('image-gen');
    await expect(page.getByRole('button', { name: /Rédacteur/ }).first()).toBeVisible();
});

test('Journal d\'activité : événements après run', async ({ page }) => {
    await seedAndGoto(page);
    await page.getByRole('button', { name: /Lancer la chaîne/i }).click();
    await expect(page.getByText(/IDLE.*EXECUTING/i).first()).toBeVisible({ timeout: 6000 });
});
