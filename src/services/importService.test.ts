import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
    importAgentsFromFile,
    previewImport,
    commitImport,
    ImportValidationError,
} from './importService';
import { ImportLimitError } from './sheetSecurity';

const HEADER =
    "Pôle / Direction,Service / Secteur,Nom,Prénom,Poste / Fonction,Grade / Cadre d'emplois,Statut,NBI";
const csvFile = (lines: string[]) =>
    new File([[HEADER, ...lines].join('\n')], 'org.csv', { type: 'text/csv' });

describe('importAgentsFromFile', () => {
    it('imports agents from a UTF-8 CSV file', async () => {
        const file = new File(
            [
                [
                    "Pôle / Direction,Service / Secteur,Nom,Prénom,Poste / Fonction,Grade / Cadre d'emplois,Statut,NBI",
                    'CABINET,Direction,DECROUY,Clément,Maire,Élu,T,10 pts',
                ].join('\n'),
            ],
            'organigramme.csv',
            { type: 'text/csv' },
        );

        const agents = await importAgentsFromFile(file);

        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            pole: 'CABINET',
            service: 'Direction',
            nom: 'DECROUY',
            prenom: 'Clément',
            fonction: 'Maire',
            gradeStyle: 'Direction',
            nbi: '10 pts',
        });
    });

    it('imports agents from an XLSX file', async () => {
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([
            ["Pôle / Direction", 'Service / Secteur', 'Nom', 'Prénom', 'Poste / Fonction', "Grade / Cadre d'emplois", 'Statut', 'NBI'],
            ['DIRECTION GÉNÉRALE', 'Ressources', 'COSSON', 'Lauranne', 'DGA Ressources', 'D.G.A', 'T', '25 pts'],
        ]);
        XLSX.utils.book_append_sheet(workbook, sheet, 'Feuille 1');
        const workbookBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const file = new File([workbookBuffer], 'organigramme.xlsx');

        const agents = await importAgentsFromFile(file);

        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            pole: 'DIRECTION GÉNÉRALE',
            service: 'Ressources',
            nom: 'COSSON',
            prenom: 'Lauranne',
            fonction: 'DGA Ressources',
            gradeStyle: 'Direction',
            nbi: '25 pts',
        });
    });

    it('rejette un fichier trop volumineux avant lecture', async () => {
        const file = new File(['x'], 'huge.csv', { type: 'text/csv' });
        // Simule une grande taille sans matérialiser 5 Mo en mémoire.
        Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });
        await expect(importAgentsFromFile(file)).rejects.toBeInstanceOf(ImportLimitError);
    });

    it('rejette un format de fichier non supporté', async () => {
        const file = new File(['data'], 'malware.exe', { type: 'application/octet-stream' });
        await expect(importAgentsFromFile(file)).rejects.toThrow(/non supporté/);
    });
});

describe('previewImport / commitImport (Phase 7)', () => {
    const file = csvFile([
        'CABINET,Direction,DECROUY,Clément,Maire,Élu,T,10 pts',
        'CABINET,Direction,DECROUY,Clément,Maire,Élu,T,10 pts', // doublon
        'DGS,Service,MARTIN,Alice,DGA,A,T,5 pts', // valide distinct
        ',,,,,,,', // ligne sans champ exploitable → invalide
    ]);

    it('classe les lignes en valides / doublons / invalides sans muter', async () => {
        const p = await previewImport(file);
        expect(p.totals).toEqual({ rows: 4, valid: 2, invalid: 1, duplicates: 1 });
        expect(p.valid.map((a) => a.nom)).toEqual(['DECROUY', 'MARTIN']);
        expect(p.duplicates).toHaveLength(1);
        expect(p.invalid).toHaveLength(1);
        expect(p.warnings.length).toBeGreaterThan(0);
    });

    it('commitImport refuse l\'import si des lignes sont invalides (tout-ou-rien)', async () => {
        const p = await previewImport(file);
        expect(() => commitImport(p)).toThrow(ImportValidationError);
    });

    it('commitImport avec allowInvalid renvoie uniquement les lignes valides', async () => {
        const p = await previewImport(file);
        const agents = commitImport(p, { allowInvalid: true });
        expect(agents.map((a) => a.nom)).toEqual(['DECROUY', 'MARTIN']);
    });
});
