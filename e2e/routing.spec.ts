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

/**
 * URL manipulées à la main.
 *
 * Les paramètres de route sont saisissables : `?v=`, `?pole=`, `?agent=`,
 * `?node=`, `?edit=`. Aucune valeur, même absurde ou hostile, ne doit produire
 * de page blanche ou d'exception non rattrapée — `parseAppRoute` est tolérant
 * par construction et retombe sur la vue par défaut.
 *
 * Ce que ces cas NE couvrent pas : l'escalade de privilèges par l'URL. En mode
 * hermétique, `isLocalMode` rend tout permis (pas de Supabase, donc pas de
 * rôle). Le volet rôles est couvert par
 * src/components/views/urlPermissions.test.tsx et, côté serveur, par
 * orchestrator/tests/workspaceRpcSecurity.integration.test.ts.
 */
const URLS_HOSTILES = [
    '/?v=administrateur',                      // vue inexistante
    '/?v=',                                    // vue vide
    '/?v=members&v=api-keys',                  // paramètre répété
    '/?pole=<script>alert(1)</script>',        // injection tentée
    "/?agent=' OR 1=1 --",                     // injection tentée
    '/?node=00000000-0000-0000-0000-000000000000', // UUID valide mais inconnu
    '/?agent=' + 'a'.repeat(2000),             // valeur démesurée
    '/?edit=1&edit=0',                         // drapeau contradictoire
    '/?edit=true',                             // valeur non reconnue (seul '1' compte)
];

for (const url of URLS_HOSTILES) {
    test(`URL manipulée sans casse : ${url.slice(0, 48)}`, async ({ page }) => {
        const erreurs: string[] = [];
        page.on('pageerror', (e) => erreurs.push(e.message));

        await page.goto(url);

        // L'application est rendue : la navigation est là, la page n'est pas blanche.
        await expect(page.getByRole('navigation')).toBeVisible();
        expect(erreurs, `exception non rattrapée sur ${url}`).toEqual([]);
    });
}

/** `?edit=` n'est actif que sur la valeur exacte `1`. */
test("?edit=true n'active pas le mode édition", async ({ page }) => {
    await page.goto('/?edit=true');
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]edit=1/);
});
