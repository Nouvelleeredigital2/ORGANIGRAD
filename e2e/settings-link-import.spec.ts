import { test, expect, type Page, type Route } from '@playwright/test';

type SettingsRoute = {
    graphStatus?: number;
    importStatus?: number;
    importPayload?: {
        ok: true;
        created: number;
        updated: number;
        skipped: number;
        total: number;
    };
};

const CLE_ORCHESTRATEUR = 'organigrad_orchestrator_config_v1';

async function installRouteMocks(page: Page, routeFixture: SettingsRoute) {
    await page.route('**/api/graph', (route: Route) => {
        const status = routeFixture.graphStatus ?? 200;
        if (status >= 200 && status < 300) {
            route.fulfill({
                status,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes: [] }),
            });
            return;
        }

        route.fulfill({
            status,
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
    });

    await page.route('**/api/integrations/link/import', (route: Route) => {
        if (route.request().method() !== 'POST') {
            route.continue();
            return;
        }

        const status = routeFixture.importStatus ?? 200;
        const payload =
            routeFixture.importPayload ?? {
                ok: true as const,
                created: 14,
                updated: 0,
                skipped: 0,
                total: 14,
            };

        route.fulfill({
            status,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    });
}

async function ouvrirParametres(page: Page) {
    await page.goto('/?v=settings');
    await page.getByRole('navigation').getByRole('button', { name: 'Paramètres' }).click();
    await expect(page.getByRole('heading', { name: /Paramètres\./i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Bots Hermes · LINK/i })).toBeVisible();
}

test.describe('Paramètres · import LINK', () => {
    test("import LINK bloqué sans connexion orchestrateur", async ({ page }) => {
        await page.addInitScript(
            (cle: string) => window.localStorage.removeItem(cle),
            CLE_ORCHESTRATEUR,
        );

        await page.goto('/?v=settings');

        await expect(page.getByRole('heading', { name: /Bots Hermes · LINK/i })).toBeVisible();
        const importBtn = page.getByRole('button', { name: /Importer depuis LINK/i });
        await expect(importBtn).toBeDisabled();
        await expect(
            page.getByText(/Enregistre d'abord la connexion orchestrateur ci-dessus\./i),
        ).toBeVisible();
    });

    test('orchestrateur configuré puis import LINK : succès', async ({ page }) => {
        await installRouteMocks(page, {
            graphStatus: 200,
            importPayload: { ok: true, created: 14, updated: 1, skipped: 0, total: 15 },
        });

        await page.addInitScript((cle: string) => window.localStorage.removeItem(cle), CLE_ORCHESTRATEUR);
        await ouvrirParametres(page);

        await page
            .getByPlaceholder('http://localhost:3001/api')
            .fill('http://localhost:3001/api');
        await page
            .getByPlaceholder('ok_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
            .fill('ok_e2e_test_dummy_token');
        await page.getByRole('button', { name: /Enregistrer la connexion/i }).click();

        await expect(
            page.getByText(/Configuration enregistrée · orchestrateur joignable\./i),
        ).toBeVisible();

        const importBtn = page.getByRole('button', { name: /Importer depuis LINK/i });
        await expect(importBtn).toBeEnabled();
        await importBtn.click();

        await expect(
            page.getByText(/Import LINK : 14 bot\(s\) créé\(s\), 1 mis à jour/i),
        ).toBeVisible({ timeout: 10_000 });
    });

    test('erreur import LINK : affiche un feedback d\'échec', async ({ page }) => {
        await installRouteMocks(page, {
            graphStatus: 200,
            importStatus: 503,
        });

        await page.goto('/?v=settings');
        await page.getByRole('navigation').getByRole('button', { name: 'Paramètres' }).click();
        await expect(page.getByRole('heading', { name: /Paramètres\./i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /Bots Hermes · LINK/i })).toBeVisible();

        await page
            .getByPlaceholder('http://localhost:3001/api')
            .fill('http://localhost:3001/api');
        await page
            .getByPlaceholder('ok_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
            .fill('ok_e2e_test_dummy_token');
        await page.getByRole('button', { name: /Enregistrer la connexion/i }).click();

        await expect(
            page.getByText(/Configuration enregistrée · orchestrateur joignable\./i),
        ).toBeVisible();

        const importBtn = page.getByRole('button', { name: /Importer depuis LINK/i });
        await expect(importBtn).toBeEnabled();
        await importBtn.click();

        await expect(
            page.getByText(/Import LINK échoué : OrchestratorClient: HTTP_503 \(503\)/i),
        ).toBeVisible({ timeout: 10_000 });
    });
});
