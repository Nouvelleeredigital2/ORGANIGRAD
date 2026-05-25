/**
 * Service to manage local storage for the application.
 * Phase 1 pivot : Light UI Premium exclusif — toute trace de dark mode est purgée.
 */
import type { Agent } from '../types/agent';

const STORAGE_KEYS = {
    CSV_URL: 'orgchart_csv_url',
    DELETED_IDS: 'orgchart_deleted_ids',
    AGENT_OVERRIDES: 'orgchart_agent_overrides',
    LEGACY_DARK_MODE: 'orgchart_dark_mode',
};

// Nettoyage one-shot de la clé legacy darkMode héritée d'avant le pivot.
try {
    localStorage.removeItem(STORAGE_KEYS.LEGACY_DARK_MODE);
} catch {
    /* SSR / sandbox : ignore */
}

export const storageService = {
    // CSV URL
    getCsvUrl: (): string => {
        return localStorage.getItem(STORAGE_KEYS.CSV_URL) || '';
    },
    setCsvUrl: (url: string): void => {
        localStorage.setItem(STORAGE_KEYS.CSV_URL, url);
    },

    // Local Edits (Deleted IDs)
    getDeletedIds: (): string[] => {
        const data = localStorage.getItem(STORAGE_KEYS.DELETED_IDS);
        return data ? JSON.parse(data) : [];
    },
    setDeletedIds: (ids: string[]): void => {
        localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(ids));
    },

    // Local Edits (Agent Overrides) — legacy RH, conservé jusqu'à migration HybridNode
    getAgentOverrides: (): Record<string, Partial<Agent>> => {
        const data = localStorage.getItem(STORAGE_KEYS.AGENT_OVERRIDES);
        return data ? JSON.parse(data) : {};
    },
    setAgentOverrides: (overrides: Record<string, Partial<Agent>>): void => {
        localStorage.setItem(STORAGE_KEYS.AGENT_OVERRIDES, JSON.stringify(overrides));
    },

    // Clear all
    clearAll: (): void => {
        localStorage.removeItem(STORAGE_KEYS.CSV_URL);
        localStorage.removeItem(STORAGE_KEYS.DELETED_IDS);
        localStorage.removeItem(STORAGE_KEYS.AGENT_OVERRIDES);
        localStorage.removeItem(STORAGE_KEYS.LEGACY_DARK_MODE);
    }
};
