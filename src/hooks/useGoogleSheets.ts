import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchCSV } from '../services/api';
import type { Agent } from '../types/agent';
import { resolveCsvSource } from '../utils/csvSource';

export const useGoogleSheets = (url?: string) => {
    const [data, setData] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const sourceInfo = useMemo(() => resolveCsvSource(url), [url]);
    // Compteur de « la dernière requête lancée » : sans lui, changer d'URL
    // pendant un fetch en vol (ou cliquer « Réessayer » deux fois) laisse
    // deux appels concurrents, et c'est le DERNIER À RÉSOUDRE qui gagne —
    // potentiellement l'ancienne URL si le nouveau fetch est plus lent.
    // Audit P2.
    const requestIdRef = useRef(0);

    const loadData = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        try {
            setLoading(true);
            const agents = await fetchCSV(sourceInfo.effectiveUrl);
            if (requestIdRef.current !== requestId) return; // une requête plus récente a pris le relais

            setData(agents);
            setError(null);
        } catch (err) {
            if (requestIdRef.current !== requestId) return;
            console.error(err);
            setError("Erreur lors de la recuperation des donnees.");
        } finally {
            if (requestIdRef.current === requestId) setLoading(false);
        }
    }, [sourceInfo.effectiveUrl]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return { data, loading, error, refresh: loadData, sourceInfo };
};
