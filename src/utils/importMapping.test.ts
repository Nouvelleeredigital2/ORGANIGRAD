import { describe, expect, it } from 'vitest';
import { deriveGradeStyleFromImportedRow, mapImportedRowToAgent, mapImportedRowsToAgents } from './importMapping';

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

/**
 * Régression E2E du 2026-09-04 : le format livré avec l'application
 * (`public/data.csv`) portait trois colonnes qu'aucun alias ne lisait —
 * `rattachementId`, `typeTemps`, `gradeStyle`. L'import annonçait « 10 valides »
 * et produisait un organigramme sans hiérarchie, à temps plein pour tout le monde.
 */
describe('format livré avec l’application', () => {
    const ligne = (over: Record<string, unknown> = {}) => ({
        id: '2',
        pole: 'Pole Alpha',
        service: 'Service Alpha',
        nom: 'Lefevre',
        prenom: 'Antoine',
        fonction: 'Responsable de service',
        titre: 'Responsable',
        rattachementId: '1',
        gradeStyle: 'Responsable',
        typeTemps: 'Temps partiel',
        nbi: '20',
        ...over,
    });

    it('lit la colonne typeTemps au lieu de retomber sur « Complet »', () => {
        expect(mapImportedRowToAgent(ligne()).typeTemps).toBe('Temps partiel');
    });

    it('retombe sur « Complet » quand la colonne est absente', () => {
        const sansTemps = ligne();
        delete (sansTemps as Record<string, unknown>).typeTemps;
        expect(mapImportedRowToAgent(sansTemps).typeTemps).toBe('Complet');
    });

    it('respecte le gradeStyle du fichier quand il est valide', () => {
        expect(mapImportedRowToAgent(ligne({ gradeStyle: 'Expert' })).gradeStyle).toBe('Expert');
    });

    it('déduit le grade quand la colonne est absente ou invalide', () => {
        expect(mapImportedRowToAgent(ligne({ gradeStyle: 'Zzz' })).gradeStyle).toBe('Responsable');
    });
});

describe('mapImportedRowsToAgents — rattachements', () => {
    const fichier = [
        { id: '1', nom: 'Durand', prenom: 'Camille', fonction: 'Directrice de pole', rattachementId: '' },
        { id: '2', nom: 'Lefevre', prenom: 'Antoine', fonction: 'Responsable de service', rattachementId: '1' },
        { id: '3', nom: 'Moreau', prenom: 'Sophie', fonction: 'Chargee de mission', rattachementId: '2' },
    ];

    it('traduit le rattachement du fichier en identifiant interne', () => {
        const agents = mapImportedRowsToAgents(fichier);
        const [durand, lefevre, moreau] = agents;

        expect(durand!.rattachementId).toBeNull();
        expect(lefevre!.rattachementId).toBe(durand!.id);
        expect(moreau!.rattachementId).toBe(lefevre!.id);
    });

    it('survit au réordonnancement des lignes', () => {
        const inverse = [...fichier].reverse();
        const agents = mapImportedRowsToAgents(inverse);
        const parCle = new Map(agents.map((a) => [a.nom, a]));

        expect(parCle.get('Moreau')!.rattachementId).toBe(parCle.get('Lefevre')!.id);
        expect(parCle.get('Lefevre')!.rattachementId).toBe(parCle.get('Durand')!.id);
    });

    it('laisse racine un rattachement qui ne désigne aucune ligne', () => {
        const agents = mapImportedRowsToAgents([{ ...fichier[1], rattachementId: '999' }]);
        expect(agents[0]!.rattachementId).toBeNull();
    });

    it('refuse l’auto-rattachement plutôt que de créer un cycle', () => {
        const agents = mapImportedRowsToAgents([{ ...fichier[1], rattachementId: '2' }]);
        expect(agents[0]!.rattachementId).toBeNull();
    });

    it('ne rattache rien quand le fichier ne porte pas de colonne de rattachement', () => {
        const agents = mapImportedRowsToAgents([
            { nom: 'Durand', prenom: 'Camille', fonction: 'Directrice de pole' },
            { nom: 'Lefevre', prenom: 'Antoine', fonction: 'Responsable de service' },
        ]);
        expect(agents.every((a) => a.rattachementId === null)).toBe(true);
    });
});
