import type { Agent, GradeStyle } from '../types/agent';

type RawRow = Record<string, string | number | boolean | null | undefined>;

const VALID_GRADES: readonly GradeStyle[] = ['Direction', 'Responsable', 'Expert', 'Agent', 'Support'];

/**
 * Valide `value` contre l'union `GradeStyle`, avec repli sur `'Agent'`.
 *
 * Avant ce correctif : `(String(row.gradeStyle) as GradeStyle) || 'Agent'`.
 * Quand `gradeStyle` est absent, `String(undefined)` vaut la chaîne
 * `"undefined"` — une valeur TRUTHY — donc le repli `|| 'Agent'` ne
 * s'appliquait jamais : l'agent héritait du grade littéral invalide
 * `"undefined"`, hors union, avec un score de tri à 0 (poleHierarchy.ts).
 * Audit P2.
 */
const toGradeStyle = (value: unknown): GradeStyle => {
    const s = typeof value === 'string' ? value : '';
    return (VALID_GRADES as readonly string[]).includes(s) ? (s as GradeStyle) : 'Agent';
};

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
        gradeStyle: toGradeStyle(row.gradeStyle),
        typeTemps: (row.typeTemps && String(row.typeTemps).toLowerCase().includes('non')) ? 'Non complet' : 'Complet',
        nbi: row.nbi ? String(row.nbi) : undefined,
        avatarUrl: row.avatarUrl ? String(row.avatarUrl) : undefined,
        email: row.email ? String(row.email) : undefined,
        phone: row.phone ? String(row.phone) : undefined,
    };
};
