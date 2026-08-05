import { test, expect, type Page } from '@playwright/test';

const CSV = [
    'id,pole,service,nom,prenom,fonction,titre,rattachementId,gradeStyle,typeTemps,nbi',
    'a1,TECHNIQUE,Direction,DUPONT,Jean,Directeur,, ,Direction,Complet,10',
    'a2,TECHNIQUE,Direction,MARTIN,Claire,Agent,,a1,Agent,Complet,0',
].join('\n');

async function ouvrirCsvDirect(page: Page) {
    await page.route('**/data.csv', (route) =>
        route.fulfill({ status: 200, contentType: 'text/csv', body: CSV }),
    );
    await page.goto('/');
    await expect(page.getByText('Jean DUPONT')).toBeVisible();
    await expect(page.getByText('Claire MARTIN')).toBeVisible();
}

function carte(page: Page, name: string) {
    return page.getByRole('heading', { name }).locator('xpath=../..');
}

test('sans fiche, les exports sont indisponibles et expliqués', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    await expect(page.getByText(/Importez des fiches avant d'exporter/i)).toBeVisible();
});

test('modifier une fiche CSV conserve les autres fiches visibles', async ({ page }) => {
    await ouvrirCsvDirect(page);
    await page.getByText('Edition', { exact: true }).click();
    await carte(page, 'Jean DUPONT').hover();
    await carte(page, 'Jean DUPONT').getByRole('button', { name: 'Profil' }).click();
    await page.getByPlaceholder('Prénom').fill('Jeanne');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText('Jeanne DUPONT')).toBeVisible();
    await expect(page.getByText('Claire MARTIN')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Jeanne DUPONT')).toBeVisible();
    await expect(page.getByText('Claire MARTIN')).toBeVisible();
});

test('supprimer une fiche CSV la retire réellement de l’organigramme', async ({ page }) => {
    await ouvrirCsvDirect(page);
    await page.getByText('Edition', { exact: true }).click();
    await carte(page, 'Jean DUPONT').hover();
    page.once('dialog', (dialog) => void dialog.accept());
    await carte(page, 'Jean DUPONT').getByTitle("Supprimer l'agent").click();

    await expect(page.getByText('Jean DUPONT')).toBeHidden();
    await expect(page.getByText('Claire MARTIN')).toBeVisible();
});
