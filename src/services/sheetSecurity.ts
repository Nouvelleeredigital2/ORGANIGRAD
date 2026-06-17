/**
 * Sécurité des imports/exports tabulaires (Priorité 10).
 *
 * Deux dangers couverts :
 *   1. IMPORT (CSV/XLSX) : fichiers hostiles ou démesurés → DoS, structures
 *      trop complexes, cellules géantes. On borne taille/feuilles/lignes/
 *      colonnes/longueur de cellule et on rejette avec des messages exploitables.
 *      (Atténue aussi la surface des CVE `xlsx` — prototype pollution / ReDoS.)
 *   2. EXPORT (CSV) : injection de formules Excel/Sheets (« CSV injection »).
 *      Une cellule commençant par = + - @ TAB CR peut exécuter une formule à
 *      l'ouverture. On neutralise via une fonction CENTRALE.
 */

export const IMPORT_LIMITS = {
    /** Taille maximale du fichier importé (octets). */
    maxFileBytes: 5 * 1024 * 1024, // 5 Mo
    /** Nombre maximal de feuilles dans un classeur. */
    maxSheets: 20,
    /** Nombre maximal de lignes de données. */
    maxRows: 20_000,
    /** Nombre maximal de colonnes. */
    maxColumns: 100,
    /** Longueur maximale d'une cellule (caractères). */
    maxCellLength: 10_000,
} as const;

export class ImportLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImportLimitError';
    }
}

/** Vérifie la taille du fichier avant toute lecture en mémoire. */
export function assertFileSize(file: { size: number; name?: string }): void {
    if (file.size > IMPORT_LIMITS.maxFileBytes) {
        const mb = (IMPORT_LIMITS.maxFileBytes / (1024 * 1024)).toFixed(0);
        throw new ImportLimitError(
            `Fichier trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} Mo). Maximum autorisé : ${mb} Mo.`,
        );
    }
}

export function assertSheetCount(count: number): void {
    if (count > IMPORT_LIMITS.maxSheets) {
        throw new ImportLimitError(
            `Classeur trop complexe : ${count} feuilles (maximum ${IMPORT_LIMITS.maxSheets}).`,
        );
    }
}

export function assertDimensions(rows: number, columns: number): void {
    if (rows > IMPORT_LIMITS.maxRows) {
        throw new ImportLimitError(
            `Trop de lignes : ${rows} (maximum ${IMPORT_LIMITS.maxRows}).`,
        );
    }
    if (columns > IMPORT_LIMITS.maxColumns) {
        throw new ImportLimitError(
            `Trop de colonnes : ${columns} (maximum ${IMPORT_LIMITS.maxColumns}).`,
        );
    }
}

/** Vérifie qu'aucune cellule ne dépasse la longueur maximale. */
export function assertCellLengths(rows: Array<Record<string, unknown>>): void {
    for (const row of rows) {
        for (const value of Object.values(row)) {
            if (typeof value === 'string' && value.length > IMPORT_LIMITS.maxCellLength) {
                throw new ImportLimitError(
                    `Cellule trop longue (${value.length} caractères, maximum ${IMPORT_LIMITS.maxCellLength}).`,
                );
            }
        }
    }
}

// ── Anti-injection de formules CSV ───────────────────────────────────────────

/** Caractères de tête déclenchant l'exécution d'une formule à l'ouverture. */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralise une valeur de cellule destinée à un CSV : si elle commence par un
 * caractère déclencheur de formule, on la préfixe d'une apostrophe (`'`) — Excel
 * et Google Sheets traitent alors la cellule comme du texte littéral.
 *
 * Seules les chaînes sont concernées ; les nombres/booléens passent tels quels.
 */
export function neutralizeCsvValue<T>(value: T): T | string {
    if (typeof value !== 'string' || value.length === 0) return value;
    if (FORMULA_TRIGGERS.includes(value[0]!)) {
        return `'${value}`;
    }
    return value;
}

/** Applique `neutralizeCsvValue` à toutes les cellules d'un jeu de lignes. */
export function sanitizeRowsForCsv<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows.map((row) => {
        const safe: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
            safe[k] = neutralizeCsvValue(v);
        }
        return safe as T;
    });
}
