import { test, expect, type Page } from '@playwright/test';

/**
 * E2E — deux onglets ouverts en parallèle (P2-18).
 *
 * Les deux pages partagent le même contexte navigateur, donc le même
 * `localStorage` et les mêmes événements `storage` — exactement comme deux
 * onglets réels de la même application.
 *
 * Périmètre : ce qui est observable HORS LIGNE. En mode hermétique, Supabase
 * est désactivé, donc `isLocalMode` rend tout permis et aucune notion de rôle
 * n'existe. Les points de la check-liste P2-18 qui portent sur les DROITS
 * (changement de rôle, révocation de clé) ne sont donc pas testables ici :
 * ils sont couverts en test composant (`src/hooks/useWorkspace.test.ts`,
 * revalidation au retour sur l'onglet) et devront l'être en recette connectée.
 *
 * Ce qui est couvert ici : la configuration orchestrateur (synchronisée) et les
 * données métier (NON synchronisées — comportement caractérisé, pas validé).
 */

const CLE_CONFIG = 'organigrad_orchestrator_config_v1';

async function ouvrirParametres(page: Page) {
    await page.getByRole('navigation').getByRole('button', { name: 'Paramètres' }).click();
    await expect(page.getByRole('heading', { name: /Orchestrateur · Connexion/i })).toBeVisible();
}

test.describe('deux onglets', () => {
    test("la configuration orchestrateur enregistrée dans un onglet atteint l'autre", async ({
        context,
    }) => {
        const onglet1 = await context.newPage();
        const onglet2 = await context.newPage();
        await onglet1.goto('/');
        await onglet2.goto('/');

        await ouvrirParametres(onglet1);
        await ouvrirParametres(onglet2);

        // L'onglet 2 est déjà chargé AVANT l'écriture : c'est bien la
        // propagation qui est testée, pas un rechargement.
        await onglet1.getByPlaceholder('http://localhost:3001/api').fill('http://localhost:3001/api');
        await onglet1
            .getByPlaceholder('ok_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
            .fill('ok_multi_onglets');
        await onglet1.getByRole('button', { name: /Enregistrer la connexion/i }).click();
        await expect(onglet1.getByText(/Configuration enregistrée/i)).toBeVisible();

        // `useOrchestratorConfig` écoute `storage` : l'onglet 2 doit suivre.
        await expect
            .poll(
                async () =>
                    onglet2.evaluate((k) => window.localStorage.getItem(k), CLE_CONFIG),
                { timeout: 5_000 },
            )
            .toContain('ok_multi_onglets');
        await expect(onglet2.getByPlaceholder('http://localhost:3001/api')).toHaveValue(
            'http://localhost:3001/api',
        );

        await onglet1.close();
        await onglet2.close();
    });

    test("la déconnexion de l'orchestrateur se propage aussi", async ({ context }) => {
        // Le sens inverse compte autant : un onglet ne doit pas continuer à se
        // croire connecté à un orchestrateur dont un autre onglet vient de
        // retirer le jeton.
        const onglet1 = await context.newPage();
        const onglet2 = await context.newPage();
        await onglet1.goto('/');
        await ouvrirParametres(onglet1);
        await onglet1.getByPlaceholder('http://localhost:3001/api').fill('http://localhost:3001/api');
        await onglet1.getByPlaceholder('ok_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx').fill('ok_a_retirer');
        await onglet1.getByRole('button', { name: /Enregistrer la connexion/i }).click();
        await expect(onglet1.getByText(/Configuration enregistrée/i)).toBeVisible();

        await onglet2.goto('/');
        await ouvrirParametres(onglet2);
        await expect(onglet2.getByPlaceholder('http://localhost:3001/api')).toHaveValue(
            'http://localhost:3001/api',
        );

        await onglet1.getByRole('button', { name: /Déconnecter/i }).click();

        await expect
            .poll(
                async () =>
                    onglet2.evaluate((k) => window.localStorage.getItem(k), CLE_CONFIG),
                { timeout: 5_000 },
            )
            .toBeNull();
        await expect(onglet2.getByPlaceholder('http://localhost:3001/api')).toHaveValue('');

        await onglet1.close();
        await onglet2.close();
    });

    /**
     * ⚠️ CARACTÉRISATION — documente le comportement actuel, ne le valide pas.
     *
     * `hybridNodeStore` (localStorage) n'a aucun écouteur `storage`, à la
     * différence de la configuration orchestrateur. Un onglet ouvert affiche
     * donc indéfiniment les données qu'il avait au chargement.
     *
     * En mode connecté, Realtime corrige cela pour les nœuds — mais pas en mode
     * local, et pas pour les fiches RH. Combiné au « dernier écrivain gagne »
     * (cf. docs/architecture/concurrence-ecritures.md), un onglet périmé qui
     * enregistre réimpose son état.
     *
     * Ce test échouera le jour où la synchronisation sera ajoutée : il faudra
     * alors le réécrire en test de conformité, pas le supprimer.
     */
    test('les données métier ne se propagent PAS entre onglets (hors Realtime)', async ({
        context,
    }) => {
        const onglet1 = await context.newPage();
        const onglet2 = await context.newPage();
        await onglet1.goto('/');
        await onglet2.goto('/');
        await expect(onglet1.getByRole('navigation')).toBeVisible();
        await expect(onglet2.getByRole('navigation')).toBeVisible();

        const CLE = 'organigrad_hybrid_nodes_v1::local';

        // L'onglet 1 écrit dans le magasin local, comme le ferait une création.
        await onglet1.evaluate(
            ([cle, valeur]) => window.localStorage.setItem(cle!, valeur!),
            [CLE, JSON.stringify([{ id: 'multi-onglets-1', nom: 'Créé ailleurs' }])] as const,
        );

        // L'onglet 2 voit bien la nouvelle valeur dans localStorage (même
        // origine)…
        await expect
            .poll(async () => onglet2.evaluate((k) => window.localStorage.getItem(k), CLE))
            .toContain('multi-onglets-1');

        // … mais son interface ne la reprend pas : aucun écouteur `storage`.
        await expect(onglet2.getByText('Créé ailleurs')).toHaveCount(0);

        // Elle n'apparaît qu'au rechargement.
        await onglet2.reload();
        await expect(onglet2.getByRole('navigation')).toBeVisible();

        await onglet1.close();
        await onglet2.close();
    });
});
