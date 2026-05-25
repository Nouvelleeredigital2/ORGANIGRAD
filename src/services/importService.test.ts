import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { importAgentsFromFile } from './importService';

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
});
