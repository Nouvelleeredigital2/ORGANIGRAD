import type { Agent, GradeStyle } from '../types/agent';

type RawRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Normalizes a raw CSV or JSON row into a strictly typed Agent object.
 */
export const normalizeAgent = (row: RawRow): Agent => {
    return {
        id: String(row.id || crypto.randomUUID()), // Fallback gracefully if ID is missing
        nom: String(row.nom || ''),
        prenom: String(row.prenom || ''),
        fonction: String(row.fonction || ''),
        titre: String(row.titre || ''),
        service: String(row.service || ''),
        pole: String(row.pole || ''),
        rattachementId: row.rattachementId ? String(row.rattachementId) : null,
        gradeStyle: (String(row.gradeStyle) as GradeStyle) || 'Agent',
        typeTemps: (row.typeTemps && String(row.typeTemps).toLowerCase().includes('non')) ? 'Non complet' : 'Complet',
        nbi: row.nbi ? String(row.nbi) : undefined,
        avatarUrl: row.avatarUrl ? String(row.avatarUrl) : undefined,
        email: row.email ? String(row.email) : undefined,
        phone: row.phone ? String(row.phone) : undefined,
    };
};
