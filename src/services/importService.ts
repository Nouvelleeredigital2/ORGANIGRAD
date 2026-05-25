import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Agent } from '../types/agent';
import { mapImportedRowToAgent } from '../utils/importMapping';

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
                resolve(filterImportedAgents(results.data.map((row, index) => mapImportedRowToAgent(row, index))));
            },
            error: reject,
        });
    });
};

const parseWorkbookAgents = (buffer: ArrayBuffer): Agent[] => {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
        return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return filterImportedAgents(rows.map((row, index) => mapImportedRowToAgent(row, index)));
};

export const importAgentsFromFile = async (file: File): Promise<Agent[]> => {
    const buffer = await file.arrayBuffer();
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.csv')) {
        return parseCsvAgents(buffer);
    }

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        return parseWorkbookAgents(buffer);
    }

    throw new Error('Format de fichier non supporte.');
};
