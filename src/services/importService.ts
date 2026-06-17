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

const filterImportedAgents = (agents: Agent[]): Agent[] => {
    return agents.filter((agent) => {
        return Boolean(agent.pole || agent.service || agent.nom || agent.prenom || agent.fonction);
    });
};

const parseCsvAgents = (buffer: ArrayBuffer): Promise<Agent[]> => {
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
                    resolve(
                        filterImportedAgents(data.map((row, index) => mapImportedRowToAgent(row, index))),
                    );
                } catch (err) {
                    reject(err);
                }
            },
            error: reject,
        });
    });
};

const parseWorkbookAgents = async (buffer: ArrayBuffer): Promise<Agent[]> => {
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
    // Dimensions déclarées par la feuille (avant matérialisation des lignes).
    const ref = sheet?.['!ref'];
    if (ref) {
        const range = XLSX.utils.decode_range(ref);
        const cols = range.e.c - range.s.c + 1;
        const rows = range.e.r - range.s.r + 1;
        assertDimensions(rows, cols);
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    assertDimensions(rows.length, 0);
    assertCellLengths(rows);
    return filterImportedAgents(rows.map((row, index) => mapImportedRowToAgent(row, index)));
};

export const importAgentsFromFile = async (file: File): Promise<Agent[]> => {
    // Garde-fou taille AVANT de charger le fichier en mémoire.
    assertFileSize(file);
    const buffer = await file.arrayBuffer();
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.csv')) {
        return parseCsvAgents(buffer);
    }

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        return parseWorkbookAgents(buffer);
    }

    throw new Error('Format de fichier non supporté (formats acceptés : .csv, .xlsx, .xls).');
};
