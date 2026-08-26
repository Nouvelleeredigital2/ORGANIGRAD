import { test, expect, type Page, type Download } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';

/**
 * E2E — export PDF (P1-13).
 *
 * Ce qui n'avait jamais été vérifié : le FICHIER. Les tests existants
 * s'arrêtaient au message de succès, or un toast vert ne prouve rien — c'est
 * précisément ce que le plan demande d'écarter (« aucun toast de succès ne doit
 * être affiché si le fichier n'a pas réellement été produit »).
 *
 * On récupère donc le téléchargement, on l'ouvre sur disque, et on regarde ce
 * qu'il contient.
 *
 * Entièrement hors ligne : jsPDF et html2canvas tournent dans le navigateur,
 * aucun Supabase n'intervient.
 */

const CSV = [
    'id,pole,service,nom,prenom,fonction,titre,rattachementId,gradeStyle,typeTemps,nbi',
    'a1,TECHNIQUE,Direction,DUPONT,Jean,Directeur,, ,Direction,Complet,10',
    'a2,TECHNIQUE,Direction,MARTIN,Claire,Agent,,a1,Agent,Complet,0',
    'b1,CULTURE,Mediatheque,BERNARD,Alice,Responsable,, ,Direction,Complet,5',
    'b2,CULTURE,Mediatheque,PETIT,Marc,Agent,,b1,Agent,Complet,0',
].join('\n');

async function ouvrirAvecFiches(page: Page) {
    await page.route('**/data.csv', (route) =>
        route.fulfill({ status: 200, contentType: 'text/csv', body: CSV }),
    );
    await page.goto('/');
    // Attente volontairement AGNOSTIQUE au pôle : le contrôleur sélectionne
    // automatiquement `poleDirectory[0]`, donc attendre un agent précis revient
    // à parier sur l'ordre de tri des pôles. Le bouton d'export ne s'active
    // qu'une fois des fiches chargées : c'est le signal fiable.
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
}

/** Lit le fichier téléchargé et en extrait de quoi juger s'il est exploitable. */
async function inspecterPdf(download: Download) {
    const chemin = await download.path();
    expect(chemin, "le téléchargement n'a produit aucun fichier").toBeTruthy();

    const taille = statSync(chemin!).size;
    const octets = readFileSync(chemin!);
    // `latin1` : on cherche des marqueurs ASCII dans un binaire ; `utf8`
    // remplacerait les octets non valides et pourrait masquer un marqueur.
    const texte = octets.toString('latin1');

    return {
        nom: download.suggestedFilename(),
        taille,
        // Un PDF valide commence par %PDF- et se termine par %%EOF. Un fichier
        // tronqué (export interrompu) a l'un sans l'autre.
        entete: texte.slice(0, 5),
        seTermineProprement: texte.trimEnd().endsWith('%%EOF'),
        pages: (texte.match(/\/Type\s*\/Page[^s]/g) ?? []).length,
        texte,
    };
}

test.describe('export PDF — le fichier, pas le toast', () => {
    test('produit un PDF lisible, non vide, avec le contenu attendu', async ({ page }) => {
        await ouvrirAvecFiches(page);

        await page.getByRole('button', { name: 'Export PDF' }).click();
        await expect(page.getByText(/Aperçu export/i)).toBeVisible();

        const attente = page.waitForEvent('download', { timeout: 30_000 });
        await page.getByRole('button', { name: /Télécharger le PDF/i }).click();
        const pdf = await inspecterPdf(await attente);

        // 1. Un fichier existe et porte un nom exploitable.
        expect(pdf.nom).toMatch(/^Organigramme-.*\.pdf$/);

        // 2. Sa taille est supérieure à zéro — et même largement : un PDF
        //    contenant une image d'organigramme ne fait pas 2 Ko. Un seuil à
        //    zéro laisserait passer un fichier vide mais bien formé.
        expect(pdf.taille).toBeGreaterThan(10_000);

        // 3. Il est lisible en tant que PDF.
        expect(pdf.entete).toBe('%PDF-');
        expect(pdf.seTermineProprement, 'PDF tronqué : %%EOF absent').toBe(true);
        expect(pdf.pages).toBeGreaterThanOrEqual(1);

        // 4. Son contenu est bien celui attendu — le pied de page est écrit en
        //    texte par jsPDF, donc lisible dans le flux sans décompression.
        expect(pdf.texte).toContain('Organigrad');

        // 5. Le succès reste lisible après la fin effective du téléchargement,
        // au-delà de la durée générique d'un toast vert.
        await page.waitForTimeout(4_500);
        await expect(page.getByText(/Export PDF terminé/i)).toBeVisible();
    });

    test('le nom du fichier porte le pôle réellement affiché', async ({ page }) => {
        await ouvrirAvecFiches(page);

        await page.getByRole('button', { name: 'Export PDF' }).click();
        await expect(page.getByText(/Aperçu export/i)).toBeVisible();

        // Le pôle est LU dans l'aperçu plutôt que supposé : le contrôleur en
        // sélectionne un automatiquement, et parier sur l'ordre de tri rendrait
        // le test faux le jour où il change.
        const poleAffiche = (await page.locator('.pp-pole').first().innerText()).trim();
        expect(poleAffiche.length).toBeGreaterThan(0);

        const attente = page.waitForEvent('download', { timeout: 30_000 });
        await page.getByRole('button', { name: /Télécharger le PDF/i }).click();
        const pdf = await inspecterPdf(await attente);

        // Même assainissement que `exportPdf.ts` : tout ce qui n'est pas
        // alphanumérique devient un tiret.
        expect(pdf.nom).toContain(poleAffiche.replace(/[^a-zA-Z0-9]/g, '-'));
        expect(pdf.entete).toBe('%PDF-');
        expect(pdf.taille).toBeGreaterThan(10_000);
    });

    test('export par lots : un fichier lisible par pôle', async ({ page }) => {
        await ouvrirAvecFiches(page);

        const telechargements: Download[] = [];
        page.on('download', (d) => telechargements.push(d));

        await page.getByRole('navigation').getByRole('button', { name: /Export par lots/i }).click();

        // Deux pôles dans le jeu de données → deux fichiers attendus.
        await expect.poll(() => telechargements.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
        await expect(page.getByText(/Export par lots/i).last()).toBeVisible();

        for (const d of telechargements) {
            const pdf = await inspecterPdf(d);
            expect(pdf.entete, `${pdf.nom} n'est pas un PDF`).toBe('%PDF-');
            expect(pdf.taille, `${pdf.nom} est vide`).toBeGreaterThan(10_000);
            expect(pdf.seTermineProprement, `${pdf.nom} est tronqué`).toBe(true);
        }
    });

    test("un échec de rendu n'affiche PAS de succès et ne produit aucun fichier", async ({
        page,
    }) => {
        // On casse le rendu au niveau du canvas : c'est l'étape sur laquelle
        // repose html2canvas, et l'échec y est réaliste (canvas « souillé » par
        // une image tierce, mémoire insuffisante sur un grand organigramme).
        await page.addInitScript(() => {
            HTMLCanvasElement.prototype.toDataURL = () => {
                throw new Error('canvas indisponible (simulé)');
            };
        });
        await ouvrirAvecFiches(page);

        const telechargements: Download[] = [];
        page.on('download', (d) => telechargements.push(d));

        await page.getByRole('button', { name: 'Export PDF' }).click();
        await expect(page.getByText(/Aperçu export/i)).toBeVisible();
        await page.getByRole('button', { name: /Télécharger le PDF/i }).click();

        // L'échec est annoncé comme tel, et dit explicitement qu'aucun fichier
        // n'a été téléchargé.
        await expect(page.getByText(/Export PDF échoué/i)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/Aucun fichier n'a été téléchargé/i)).toBeVisible();
        await expect(page.getByText(/Export PDF terminé/i)).toHaveCount(0);
        expect(telechargements).toHaveLength(0);
    });
});
