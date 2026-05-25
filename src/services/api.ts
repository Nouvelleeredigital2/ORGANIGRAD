import Papa from 'papaparse';
import type { Agent } from '../types/agent';
import { normalizeAgent } from '../utils/normalizeAgent';

export const fetchCSV = async (url: string): Promise<Agent[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse<Record<string, string>>(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                // Validation / Transformation of raw strings into proper types
                const agents: Agent[] = results.data.map(normalizeAgent);
                resolve(agents);
            },
            error: (error) => {
                console.error("Erreur de parsing CSV:", error);
                reject(error);
            }
        });
    });
};
