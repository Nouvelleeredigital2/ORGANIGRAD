import type { Agent, GradeStyle } from '../types/agent';

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
    const typeTemps = getRowValue(row, ['Temps', 'temps']) || 'Complet';

    return {
        id: buildImportedAgentId(nom, prenom, fonction),
        nom,
        prenom,
        fonction,
        titre,
        service,
        pole,
        rattachementId: null,
        gradeStyle: deriveGradeStyleFromImportedRow({ fonction, titre, statut }),
        typeTemps,
        nbi,
    };
};
