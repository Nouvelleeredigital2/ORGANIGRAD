import { test, expect, type Page } from '@playwright/test';

/**
 * E2E — corrections des bugs identifiés :
 *   #1 NodeEditor génère des UUIDs valides (RFC 4122 v4) côté client
 *   #2 useOrchestratorBridge passe en mode connecté quand l'API répond OK
 *      + l'indicateur visuel reflète la connexion
 *
 * Le serveur orchestrateur est MOCKÉ via `page.route` — pas besoin d'un vrai
 * backend pour valider le câblage front.
 */

const STORAGE_KEY = 'organigrad_hybrid_nodes_v1';
const CONFIG_KEY = 'organigrad_orchestrator_config_v1';

const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function gotoOrchestration(page: Page) {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Orchestration' }).click();
    await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
}

test('Bug #1 fix — NodeEditor génère un UUID v4 valide pour le nouveau nœud', async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await gotoOrchestration(page);

    await page.getByRole('button', { name: /Créer le premier nœud/i }).click();
    await page.getByPlaceholder('Rédacteur Campagne').fill('UUID Test');
    await page.getByPlaceholder('Génère textes & visuels').fill('Vérif UUID');
    await page.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.getByRole('heading', { name: 'UUID Test' })).toBeVisible();

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBeTruthy();
    const nodes = JSON.parse(stored!) as Array<{ id: string }>;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.id).toMatch(UUID_V4);
    // Plus de format legacy "node-xxx"
    expect(nodes[0]!.id).not.toMatch(/^node-/);
});

test('Bug #2 fix — indicateur "Mode local" affiché sans config orchestrateur', async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.removeItem(key), CONFIG_KEY);
    await gotoOrchestration(page);
    await expect(page.getByText(/Mode local · transitions simulées/i)).toBeVisible();
    await expect(page.getByText(/Orchestrateur connecté/i)).toBeHidden();
});

test('Bug #2 fix — indicateur "Orchestrateur connecté" quand l\'API répond OK', async ({ page }) => {
    // Mock l'orchestrateur : /api/graph → graphe vide, status 200
    await page.route('http://mock-orch.local/api/graph', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ nodes: [] }),
        }),
    );
    // EventSource sur /api/events — Playwright peut le router aussi mais ce n'est
    // pas requis pour le test du `connected` (basé sur fetchGraph qui réussit)
    await page.route(/.*\/api\/events.*/, (route) =>
        route.fulfill({
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
            body: ': connected\n\n',
        }),
    );

    // Pré-configure la connexion en localStorage
    await page.addInitScript(
        ({ k, v }) => window.localStorage.setItem(k, v),
        {
            k: CONFIG_KEY,
            v: JSON.stringify({
                baseUrl: 'http://mock-orch.local/api',
                apiKey: 'ok_e2e_token',
            }),
        },
    );

    await gotoOrchestration(page);
    await expect(page.getByText(/Orchestrateur connecté/i)).toBeVisible({ timeout: 6000 });
});

test('Bug #2 fix — quand connecté, "Lancer la chaîne" POST sur l\'orchestrateur (Bearer)', async ({
    page,
}) => {
    let capturedAuth: string | undefined;
    let runCalled = false;

    // Fixture front : un nœud racine local pour avoir un id à passer
    const ROOT_ID = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee';
    await page.addInitScript(
        ({ k, v }) => window.localStorage.setItem(k, v),
        {
            k: STORAGE_KEY,
            v: JSON.stringify([
                {
                    id: ROOT_ID,
                    type: 'AGENT_IA',
                    nom: 'R',
                    roleTitre: 'r',
                    parentID: null,
                    gradeId: 'E',
                    status: 'IDLE',
                },
            ]),
        },
    );
    await page.addInitScript(
        ({ k, v }) => window.localStorage.setItem(k, v),
        {
            k: CONFIG_KEY,
            v: JSON.stringify({
                baseUrl: 'http://mock-orch.local/api',
                apiKey: 'ok_secret_e2e',
            }),
        },
    );

    await page.route('http://mock-orch.local/api/graph', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ nodes: [] }),
        }),
    );
    await page.route(/.*\/api\/events.*/, (route) =>
        route.fulfill({
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
            body: ': connected\n\n',
        }),
    );
    await page.route(`http://mock-orch.local/api/nodes/${ROOT_ID}/run`, (route) => {
        capturedAuth = route.request().headers()['authorization'];
        runCalled = true;
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true }),
        });
    });

    await gotoOrchestration(page);
    await expect(page.getByText(/Orchestrateur connecté/i)).toBeVisible({ timeout: 6000 });

    await page.getByRole('button', { name: /Lancer la chaîne/i }).click();

    await expect.poll(() => runCalled).toBe(true);
    expect(capturedAuth).toBe('Bearer ok_secret_e2e');
});
