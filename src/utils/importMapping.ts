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

const buildImportedAgentId = (index: number, pole: string, service: string, nom: string, prenom: string): string => {
    const slug = `${pole}-${service}-${nom}-${prenom}`
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

    return `import-${index}-${slug || 'agent'}`;
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

export const mapImportedRowToAgent = (row: Record<string, unknown>, index: number): Agent => {
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
        id: buildImportedAgentId(index, pole, service, nom, prenom),
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
