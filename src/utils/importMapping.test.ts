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
        );

        expect(agent.pole).toBe('RESSOURCES HUMAINES');
        expect(agent.service).toBe('Carrière Paie');
        expect(agent.nom).toBe('SEGONDS');
        expect(agent.prenom).toBe('Nathalie');
        expect(agent.fonction).toBe('Responsable');
        expect(agent.titre).toBe('Adj admin pal 1 cl');
        expect(agent.nbi).toBe('25 pts');
        expect(agent.gradeStyle).toBe('Responsable');
        expect(agent.id).toBe('import:segonds-nathalie-responsable');
    });

    /**
     * Risque couvert : l'identifiant dépendait de l'index de ligne. Insérer une
     * ligne en tête décalait tous les suivants, si bien qu'une modification ou
     * une suppression enregistrée localement se réappliquait à un AUTRE agent
     * lors d'un import ultérieur — un agent pouvait disparaître en silence.
     */
    it('produit le même identifiant quelle que soit la position de la ligne', () => {
        const ligne = {
            'Pôle / Direction': 'TECHNIQUE',
            'Service / Secteur': 'Voirie',
            Nom: 'DUPONT',
            'Prénom': 'Jean',
            'Poste / Fonction': 'Agent',
        };

        const premier = mapImportedRowToAgent(ligne);
        const dernier = mapImportedRowToAgent({ ...ligne });

        expect(premier.id).toBe(dernier.id);
        expect(premier.id).not.toMatch(/\d/);
    });

    it('distingue deux homonymes de fonctions différentes', () => {
        const a = mapImportedRowToAgent({ Nom: 'MARTIN', 'Prénom': 'Claude', 'Poste / Fonction': 'Agent' });
        const b = mapImportedRowToAgent({ Nom: 'MARTIN', 'Prénom': 'Claude', 'Poste / Fonction': 'Responsable' });

        expect(a.id).not.toBe(b.id);
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
