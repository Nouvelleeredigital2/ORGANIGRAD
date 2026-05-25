import { test, expect } from '@playwright/test';

/**
 * E2E — section "Orchestrateur · Connexion" dans Paramètres.
 * Mode offline (Supabase désactivé via .env.test) — pas d'auth, pas d'API
 * keys réelles ; on teste seulement la persistance localStorage de la config.
 */

test('Paramètres · enregistre/déconnecte la config orchestrateur', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Paramètres' }).click();
    await expect(page.getByRole('heading', { name: /Orchestrateur · Connexion/i })).toBeVisible();

    await page.getByPlaceholder('http://localhost:3001/api').fill('http://localhost:3001/api');
    await page.getByPlaceholder('ok_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx').fill('ok_e2e_dummy_token');
    await page.getByRole('button', { name: /Enregistrer la connexion/i }).click();
    await expect(page.getByText(/Configuration enregistrée/i)).toBeVisible();

    // Vérifie la persistance localStorage
    const stored = await page.evaluate(() =>
        window.localStorage.getItem('organigrad_orchestrator_config_v1'),
    );
    expect(stored).toContain('ok_e2e_dummy_token');

    // Déconnexion → state remis à zéro
    await page.getByRole('button', { name: /Déconnecter/i }).click();
    const after = await page.evaluate(() =>
        window.localStorage.getItem('organigrad_orchestrator_config_v1'),
    );
    expect(after).toBeNull();
});
