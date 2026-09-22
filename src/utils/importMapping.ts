import type { Agent, GradeStyle } from '../types/agent';

/** Grades reconnus, mêmes valeurs que `normalizeAgent` — un fichier peut les fournir. */
const GRADES_RECONNUS: readonly GradeStyle[] = ['Direction', 'Responsable', 'Expert', 'Agent', 'Support'];

const normalizeLabel = (value: string): string => {
    return value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

const getRowValue = (row: Record<string, unknown>, candidates: string[]): string => {
    const candidateSet = new Set(candidates.map(normalizeLabel));

    for (const [key, value] of Object.entries(row)) {
        if (candidateSet.has(normalizeLabel(key))) {
            return String(value ?? '').trim();
        }
    }

    return '';
};

/**
 * Clé métier stable d'un agent, indépendante de sa position dans le fichier.
 *
 * Même définition que la déduplication de `previewImport` (nom|prénom|fonction) :
 * les « doublons » annoncés à l'utilisateur sont donc exactement les collisions
 * d'identité, sans écart entre ce qui est annoncé et ce qui est appliqué.
 */
export const buildExternalKey = (parts: { nom: string; prenom: string; fonction: string }): string =>
    `${parts.nom.trim().toLowerCase()}|${parts.prenom.trim().toLowerCase()}|${parts.fonction.trim().toLowerCase()}`;

/**
 * Identifiant d'un agent importé.
 *
 * Il ne doit PAS dépendre de l'index de ligne : insérer une ligne en tête
 * décalait tous les identifiants suivants, si bien qu'une modification ou une
 * suppression enregistrée localement se réappliquait à un autre agent lors
 * d'un import ultérieur.
 */
const buildImportedAgentId = (nom: string, prenom: string, fonction: string): string => {
    const slug = buildExternalKey({ nom, prenom, fonction })
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

    return `import:${slug || 'agent'}`;
};

export const deriveGradeStyleFromImportedRow = ({
    fonction,
    titre,
    statut,
}: {
    fonction: string;
    titre: string;
    statut: string;
}): GradeStyle => {
    const haystack = normalizeLabel([fonction, titre, statut].filter(Boolean).join(' '));

    if (
        haystack.includes('maire')
        || haystack.includes('directeur general')
        || haystack.includes('directrice generale')
        || haystack.includes('dgs')
        || haystack.includes('dga')
        || haystack.includes('d.g.a')
        || haystack.includes('directeur')
        || haystack.includes('directrice')
        || haystack.includes('dst')
    ) {
        return 'Direction';
    }

    if (haystack.includes('responsable') || haystack.includes('chef ')) {
        return 'Responsable';
    }

    if (
        haystack.includes('charge de mission')
        || haystack.includes('chargee de mission')
        || haystack.includes('conseiller')
        || haystack.includes('coordinateur')
        || haystack.includes('referent')
        || haystack.includes('infographiste')
        || haystack.includes('psychologue')
    ) {
        return 'Expert';
    }

    if (haystack.includes('assistant') || haystack.includes('assistante') || haystack.includes('secretariat')) {
        return 'Support';
    }

    return 'Agent';
};

/**
 * L'index de ligne n'entre plus dans l'identité de l'agent : il reste géré par
 * l'appelant, uniquement pour situer une ligne dans le rapport d'import.
 */
export const mapImportedRowToAgent = (row: Record<string, unknown>): Agent => {
    const pole = getRowValue(row, ['Pôle / Direction', 'Pole / Direction', 'pole']);
    const service = getRowValue(row, ['Service / Secteur', 'Service', 'service']);
    const nom = getRowValue(row, ['Nom', 'nom']);
    const prenom = getRowValue(row, ['Prénom', 'Prenom', 'prenom']);
    const fonction = getRowValue(row, ['Poste / Fonction', 'Fonction', 'fonction']);
    const titre = getRowValue(row, ["Grade / Cadre d'emplois", 'Grade', 'titre']);
    const statut = getRowValue(row, ['Statut', 'statut']);
    const nbi = getRowValue(row, ['NBI', 'nbi']) || undefined;
    // `typeTemps` manquait à cette liste : le format livré avec l'application
    // (`public/data.csv`, `exemple_organigramme.csv`) nomme ainsi sa colonne, qui
    // retombait donc silencieusement sur « Complet ». Un fichier déclarant « Temps
    // partiel » était importé à temps plein sans le moindre avertissement.
    const typeTemps = getRowValue(row, ['Temps', 'temps', 'typeTemps', 'Type de temps', 'Temps de travail'])
        || 'Complet';

    // Le grade explicite du fichier fait foi quand il en porte un ET qu'il est
    // valide ; la déduction depuis le libellé de fonction reste le secours.
    const gradeStyleDuFichier = getRowValue(row, ['gradeStyle', 'Grade Style', 'Niveau']);
    const gradeStyle = (GRADES_RECONNUS as readonly string[]).includes(gradeStyleDuFichier)
        ? (gradeStyleDuFichier as GradeStyle)
        : deriveGradeStyleFromImportedRow({ fonction, titre, statut });

    return {
        id: buildImportedAgentId(nom, prenom, fonction),
        nom,
        prenom,
        fonction,
        titre,
        service,
        pole,
        // Résolu par `mapImportedRowsToAgents`, seul à disposer du fichier entier :
        // un rattachement désigne une AUTRE ligne, il ne se lit pas ligne à ligne.
        rattachementId: null,
        gradeStyle,
        typeTemps,
        nbi,
    };
};

/** Valeur brute de la colonne d'identifiant de ligne, si le fichier en porte une. */
const lireIdentifiantDeLigne = (row: Record<string, unknown>): string =>
    getRowValue(row, ['id', 'ID', 'Identifiant', 'Matricule']);

/** Valeur brute de la colonne de rattachement hiérarchique, si elle existe. */
const lireRattachementDeLigne = (row: Record<string, unknown>): string =>
    getRowValue(row, [
        'rattachementId',
        'Rattachement',
        'Rattachement Id',
        'Rattachement hiérarchique',
        'Responsable hiérarchique',
        'N+1',
    ]);

/**
 * Mappe un fichier entier, **rattachements compris**.
 *
 * Pourquoi une seconde passe : `rattachementId` d'une ligne désigne l'`id` d'une
 * AUTRE ligne du même fichier, tandis que l'identifiant interne d'un agent est un
 * slug dérivé de son identité (`import:nom-prenom-fonction`) — volontairement, pour
 * survivre au réordonnancement des lignes. Les deux ne se rencontrent donc jamais
 * ligne à ligne : il faut d'abord connaître tous les identifiants du fichier, puis
 * traduire chaque rattachement en identifiant interne.
 *
 * Avant ce correctif, `rattachementId` était fixé à `null` sans être lu : l'import
 * annonçait un succès complet et produisait un organigramme **sans aucun lien
 * hiérarchique**, ce que l'affichage par niveau de grade rendait invisible.
 *
 * Un rattachement qui ne désigne aucune ligne connue, ou qui se désigne lui-même,
 * reste à `null` : l'agent redevient racine, visible, plutôt que de disparaître dans
 * une branche orpheline ou un cycle.
 */
export const mapImportedRowsToAgents = (rows: Record<string, unknown>[]): Agent[] => {
    const agents = rows.map((row) => mapImportedRowToAgent(row));

    const identifiantVersAgent = new Map<string, string>();
    rows.forEach((row, index) => {
        const brut = lireIdentifiantDeLigne(row);
        const agent = agents[index];
        if (brut && agent && !identifiantVersAgent.has(brut)) {
            identifiantVersAgent.set(brut, agent.id);
        }
    });

    rows.forEach((row, index) => {
        const agent = agents[index];
        if (!agent) return;

        const parentBrut = lireRattachementDeLigne(row);
        if (!parentBrut || parentBrut === lireIdentifiantDeLigne(row)) return;

        const parentInterne = identifiantVersAgent.get(parentBrut);
        if (parentInterne && parentInterne !== agent.id) {
            agent.rattachementId = parentInterne;
        }
    });

    return agents;
};
