import { useCallback, useEffect, useState } from 'react';

/**
 * Configuration de l'orchestrateur côté front — persistée en localStorage.
 *
 * - `baseUrl` : URL HTTP du service orchestrateur (ex. http://localhost:3001/api)
 * - `apiKey`  : clé API workspace (`ok_…`) à envoyer en Bearer
 *
 * Les deux sont optionnelles. Si absentes, la SPA reste en mode "direct Supabase"
 * et la vue Orchestration simule les transitions localement.
 */

const STORAGE_KEY = 'organigrad_orchestrator_config_v1';

export interface OrchestratorConfig {
    baseUrl: string;
    apiKey: string;
}

const DEFAULT: OrchestratorConfig = { baseUrl: '', apiKey: '' };

function load(): OrchestratorConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT;
        const parsed = JSON.parse(raw) as Partial<OrchestratorConfig>;
        return {
            baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
            apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        };
    } catch {
        return DEFAULT;
    }
}

export function useOrchestratorConfig() {
    const [config, setConfigState] = useState<OrchestratorConfig>(() => load());

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) setConfigState(load());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const save = useCallback((next: OrchestratorConfig) => {
        setConfigState(next);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* ignore */
        }
    }, []);

    const clear = useCallback(() => {
        setConfigState(DEFAULT);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }, []);

    return { config, save, clear, isConfigured: Boolean(config.baseUrl && config.apiKey) };
}
