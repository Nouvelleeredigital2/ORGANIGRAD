import { describe, expect, it } from 'vitest';
import { deriveGradeStyleFromImportedRow, mapImportedRowToAgent } from './importMapping';

describe('mapImportedRowToAgent', () => {
    it('maps the real french spreadsheet headers to the internal agent shape', () => {
        const agent = mapImportedRowToAgent(
            {
                'Pôle / Direction': 'RESSOURCES HUMAINES',
                'Service / Secteur': 'Carrière Paie',
                Nom: 'SEGONDS',
                'Prénom': 'Nathalie',
                'Poste / Fonction': 'Responsable',
                "Grade / Cadre d'emplois": 'Adj admin pal 1 cl',
                Statut: 'T',
                NBI: '25 pts',
            },
            12,
        );

        expect(agent.pole).toBe('RESSOURCES HUMAINES');
        expect(agent.service).toBe('Carrière Paie');
        expect(agent.nom).toBe('SEGONDS');
        expect(agent.prenom).toBe('Nathalie');
        expect(agent.fonction).toBe('Responsable');
        expect(agent.titre).toBe('Adj admin pal 1 cl');
        expect(agent.nbi).toBe('25 pts');
        expect(agent.gradeStyle).toBe('Responsable');
        expect(agent.id).toContain('import-12');
    });
});

describe('deriveGradeStyleFromImportedRow', () => {
    it('classifies executive and support roles from imported labels', () => {
        expect(
            deriveGradeStyleFromImportedRow({
                fonction: 'Maire',
                titre: 'Élu',
                statut: '-',
            }),
        ).toBe('Direction');

        expect(
            deriveGradeStyleFromImportedRow({
                fonction: 'Assistante de Direction',
                titre: 'Rédacteur',
                statut: 'T',
            }),
        ).toBe('Support');

        expect(
            deriveGradeStyleFromImportedRow({
                fonction: 'Chargée de mission',
                titre: 'Attaché',
                statut: 'C',
            }),
        ).toBe('Expert');
    });
});
