import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchCSV } from '../services/api';
import type { Agent } from '../types/agent';
import { resolveCsvSource } from '../utils/csvSource';

export const useGoogleSheets = (url?: string) => {
    const [data, setData] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const sourceInfo = useMemo(() => resolveCsvSource(url), [url]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const agents = await fetchCSV(sourceInfo.effectiveUrl);

            setData(agents);
            setError(null);
        } catch (err) {
            console.error(err);
            setError("Erreur lors de la recuperation des donnees.");
        } finally {
            setLoading(false);
        }
    }, [sourceInfo.effectiveUrl]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return { data, loading, error, refresh: loadData, sourceInfo };
};
