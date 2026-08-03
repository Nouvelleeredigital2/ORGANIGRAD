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

    /**
     * Renvoie `false` si la persistance a echoue (quota, navigation privee).
     * Auparavant l'echec etait avale et l'interface affichait quand meme
     * « Configuration enregistree ».
     */
    const save = useCallback((next: OrchestratorConfig): boolean => {
        setConfigState(next);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return true;
        } catch {
            return false;
        }
    }, []);

    const clear = useCallback((): boolean => {
        setConfigState(DEFAULT);
        try {
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch {
            return false;
        }
    }, []);

    return { config, save, clear, isConfigured: Boolean(config.baseUrl && config.apiKey) };
}
