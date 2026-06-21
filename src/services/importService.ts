import Papa from 'papaparse';
import type { Agent } from '../types/agent';
import { mapImportedRowToAgent } from '../utils/importMapping';
import {
    IMPORT_LIMITS,
    assertFileSize,
    assertSheetCount,
    assertDimensions,
    assertCellLengths,
} from './sheetSecurity';

const looksLikeMojibake = (text: string): boolean => {
    return /Ã.|Â|�/.test(text);
};

const decodeCsvBuffer = (buffer: ArrayBuffer): string => {
    const utf8 = new TextDecoder('utf-8').decode(buffer);
    if (looksLikeMojibake(utf8)) {
        return new TextDecoder('windows-1252').decode(buffer);
    }
    return utf8;
};

/** Un agent est "significatif" s'il porte au moins un champ exploitable. */
const isMeaningfulAgent = (agent: Agent): boolean =>
    Boolean(agent.pole || agent.service || agent.nom || agent.prenom || agent.fonction);

const filterImportedAgents = (agents: Agent[]): Agent[] => agents.filter(isMeaningfulAgent);

/** Parse CSV → tous les agents mappés (NON filtrés) pour permettre l'analyse. */
const parseCsvRows = (buffer: ArrayBuffer): Promise<Agent[]> => {
    const text = decodeCsvBuffer(buffer);

    return new Promise((resolve, reject) => {
        Papa.parse<Record<string, unknown>>(text, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                try {
                    const data = results.data;
                    assertDimensions(data.length, results.meta.fields?.length ?? 0);
                    assertCellLengths(data);
                    resolve(data.map((row, index) => mapImportedRowToAgent(row, index)));
                } catch (err) {
                    reject(err);
                }
            },
            error: reject,
        });
    });
};

const parseWorkbookRows = async (buffer: ArrayBuffer): Promise<Agent[]> => {
    // Import dynamique : xlsx (lib lourde + CVE) reste HORS du bundle initial et
    // n'est chargé qu'au moment d'un import XLSX (Priorité 12).
    const XLSX = await import('xlsx');
    // Lecture DÉFENSIVE : pas d'analyse de formules, pas d'extraction VBA/macros
    // (jamais exécutées par SheetJS, mais on évite même de les charger), et on
    // borne le nombre de lignes lues. Atténue la surface des CVE `xlsx`.
    const workbook = XLSX.read(buffer, {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
        bookVBA: false,
        sheetRows: IMPORT_LIMITS.maxRows + 1, // +1 pour l'en-tête
    });

    assertSheetCount(workbook.SheetNames.length);

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
        return [];
    }
    // Dimensions déclarées par la feuille (avant matérialisation des lignes).
    const ref = sheet['!ref'];
    if (ref) {
        const range = XLSX.utils.decode_range(ref);
        const cols = range.e.c - range.s.c + 1;
        const rows = range.e.r - range.s.r + 1;
        assertDimensions(rows, cols);
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    assertDimensions(rows.length, 0);
    assertCellLengths(rows);
    return rows.map((row, index) => mapImportedRowToAgent(row, index));
};

/** Parse un fichier → agents mappés non filtrés (CSV ou XLSX selon l'extension). */
const parseFileRows = async (file: File): Promise<Agent[]> => {
    assertFileSize(file); // garde-fou taille AVANT lecture en mémoire
    const buffer = await file.arrayBuffer();
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.csv')) return parseCsvRows(buffer);
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) return parseWorkbookRows(buffer);
    throw new Error('Format de fichier non supporté (formats acceptés : .csv, .xlsx, .xls).');
};

export const importAgentsFromFile = async (file: File): Promise<Agent[]> => {
    return filterImportedAgents(await parseFileRows(file));
};

// ─── Prévisualisation + import transactionnel (Phase 7) ───────────────────────

export interface ImportPreview {
    totals: { rows: number; valid: number; invalid: number; duplicates: number };
    /** Agents valides et dédupliqués, prêts à être importés. */
    valid: Agent[];
    /** Lignes rejetées (vides / sans champ requis). */
    invalid: Array<{ row: number; reason: string }>;
    /** Doublons détectés (même nom+prénom+fonction), exclus de `valid`. */
    duplicates: Array<{ row: number; key: string }>;
    warnings: string[];
}

const dedupKey = (a: Agent): string =>
    `${(a.nom ?? '').trim().toLowerCase()}|${(a.prenom ?? '').trim().toLowerCase()}|${(a.fonction ?? '').trim().toLowerCase()}`;

/**
 * Analyse un fichier SANS l'appliquer : classe chaque ligne en valide / invalide
 * / doublon, pour confirmation avant import. Aucune mutation.
 */
export const previewImport = async (file: File): Promise<ImportPreview> => {
    const rows = await parseFileRows(file);
    const valid: Agent[] = [];
    const invalid: ImportPreview['invalid'] = [];
    const duplicates: ImportPreview['duplicates'] = [];
    const seen = new Set<string>();

    rows.forEach((agent, i) => {
        const row = i + 1;
        if (!isMeaningfulAgent(agent)) {
            invalid.push({ row, reason: 'ligne vide ou sans champ exploitable' });
            return;
        }
        const key = dedupKey(agent);
        if (seen.has(key)) {
            duplicates.push({ row, key });
            return;
        }
        seen.add(key);
        valid.push(agent);
    });

    const warnings: string[] = [];
    if (invalid.length > 0) warnings.push(`${invalid.length} ligne(s) ignorée(s) (invalides).`);
    if (duplicates.length > 0) warnings.push(`${duplicates.length} doublon(s) ignoré(s).`);

    return {
        totals: { rows: rows.length, valid: valid.length, invalid: invalid.length, duplicates: duplicates.length },
        valid,
        invalid,
        duplicates,
        warnings,
    };
};

export class ImportValidationError extends Error {
    readonly invalid: ImportPreview['invalid'];
    constructor(invalid: ImportPreview['invalid']) {
        super(`Import refusé : ${invalid.length} ligne(s) invalide(s).`);
        this.name = 'ImportValidationError';
        this.invalid = invalid;
    }
}

/**
 * Valide une prévisualisation et renvoie les agents à importer (tout-ou-rien).
 * Par défaut, refuse l'import si des lignes invalides subsistent ; passer
 * `allowInvalid: true` pour importer uniquement les lignes valides malgré tout.
 */
export const commitImport = (
    preview: ImportPreview,
    opts: { allowInvalid?: boolean } = {},
): Agent[] => {
    if (!opts.allowInvalid && preview.invalid.length > 0) {
        throw new ImportValidationError(preview.invalid);
    }
    return preview.valid;
};
