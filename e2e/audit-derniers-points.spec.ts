import { test, expect, type Page } from '@playwright/test';

/**
 * E2E — les trois derniers points de l'audit fonctionnel.
 *
 * Ils n'étaient couverts par aucune spec : suppression de nœud inatteignable,
 * toast affirmant des canaux non joints, livrable non consultable.
 *
 * Tourne hors Supabase (.env.test) : espace de stockage `local`.
 */

const STORAGE_KEY = 'organigrad_hybrid_nodes_v1::local';

async function semer(page: Page, nodes: Record<string, unknown>[]) {
    await page.addInitScript(
        ({ k, v }) => window.localStorage.setItem(k, v),
        { k: STORAGE_KEY, v: JSON.stringify(nodes) },
    );
}

async function ouvrirOrchestration(page: Page) {
    await page.goto('/?v=orchestration');
    await expect(page.getByRole('heading', { name: /Orchestration\./i })).toBeVisible();
}

test('un nœud peut être supprimé, et la suppression survit au rafraîchissement', async ({ page }) => {
    await semer(page, [
        {
            id: 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee',
            type: 'AGENT_IA',
            nom: 'AJETER',
            roleTitre: 'à supprimer',
            parentID: null,
            gradeId: 'Expert',
            status: 'IDLE',
        },
    ]);
    await ouvrirOrchestration(page);
    await expect(page.getByRole('heading', { name: 'AJETER' })).toBeVisible();

    // La suppression demande confirmation (garde de HybridNodeCard).
    page.on('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: /Supprimer/i }).first().click();

    await expect(page.getByRole('heading', { name: 'AJETER' })).toBeHidden();

    // Elle est persistée, pas seulement retirée de l'affichage.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'AJETER' })).toBeHidden();
});

/**
 * Le driver e-mail est un no-op côté navigateur (l'envoi est délégué à
 * l'orchestrateur). Le compter comme « notifié » laissait croire que l'humain
 * avait été prévenu.
 */
test("le toast distingue un canal délégué d'un canal réellement joint", async ({ page }) => {
    await semer(page, [
        {
            id: 'hum-1',
            type: 'HUMAN',
            nom: 'VALIDEUR',
            roleTitre: 'Approbation',
            parentID: null,
            gradeId: 'Direction',
            status: 'IDLE',
            notificationChannels: { email: 'valideur@example.invalid' },
        },
    ]);
    await ouvrirOrchestration(page);
    await page.getByRole('button', { name: /Lancer la chaîne/i }).click();

    const toast = page.getByRole('status').filter({ hasText: 'Validation requise' });
    await expect(toast).toBeVisible({ timeout: 6000 });
    await expect(toast).toContainText(/Délégué\s*:\s*email/i);
    await expect(toast).not.toContainText(/Envoyé\s*:\s*email/i);
});

/**
 * On approuvait un livrable sans pouvoir le consulter : `onShowDetails`
 * n'était jamais transmis, donc le bouton n'était pas rendu.
 */
test('le Centre de validation permet de consulter le détail avant de décider', async ({ page }) => {
    await semer(page, [
        {
            id: 'hum-2',
            type: 'HUMAN',
            nom: 'ARBITRE',
            roleTitre: 'Décision',
            parentID: null,
            gradeId: 'Direction',
            status: 'WAITING_HUMAN_APPROVAL',
        },
    ]);
    await ouvrirOrchestration(page);

    await page.getByRole('button', { name: /^Valider/ }).first().click();
    await expect(page.getByRole('button', { name: /^Détails$/ })).toBeVisible();

    await page.getByRole('button', { name: /^Détails$/ }).click();
    const detail = page.getByRole('dialog', { name: /Détail · ARBITRE/ });
    await expect(detail).toBeVisible();
    // Hors Supabase, l'historique n'existe pas — et c'est dit explicitement.
    await expect(detail).toContainText(/Historique indisponible/i);
});
