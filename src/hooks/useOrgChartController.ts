import { useState, useMemo, useEffect } from 'react';
import { useGoogleSheets } from './useGoogleSheets';
import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';
import { computeTreeStats, parseNBI } from '../utils/treeStats';
import { storageService } from '../services/storageService';
import type { CsvSourceInfo } from '../utils/csvSource';
import { buildPoleDirectory, getPoleKey } from '../utils/poleDirectory';
import { buildPoleHierarchy } from '../utils/poleHierarchy';
import { importAgentsFromFile } from '../services/importService';

export type AppView = 'orgchart' | 'dashboard' | 'orchestration' | 'members' | 'api-keys' | 'settings';

export interface SelectedPoleState {
    key: string;
    pole: string;
    agents: Agent[];
    tree: TreeNode[];
}

const buildActiveSourceInfo = (
    remoteSourceInfo: CsvSourceInfo,
    importedFileName: string | null,
): CsvSourceInfo => {
    if (!importedFileName) {
        return remoteSourceInfo;
    }

    return {
        inputUrl: importedFileName,
        effectiveUrl: importedFileName,
        isRemote: false,
        label: 'Import local actif',
        helperText: `Fichier charge: ${importedFileName}`,
    };
};

export const useOrgChartController = () => {
    const [activeView, setActiveView] = useState<AppView>('orgchart');
    const [csvUrl, setCsvUrl] = useState(storageService.getCsvUrl());
    const { data: remoteAgents, loading, error, refresh, sourceInfo: remoteSourceInfo } = useGoogleSheets(csvUrl);
    const [importedAgents, setImportedAgents] = useState<Agent[] | null>(null);
    const [importedFileName, setImportedFileName] = useState<string | null>(null);
    const [selectedPoleKey, setSelectedPoleKey] = useState<string | null>(null);

    useEffect(() => {
        storageService.setCsvUrl(csvUrl);
    }, [csvUrl]);

    const [isEditMode, setIsEditMode] = useState(false);

    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set(storageService.getDeletedIds()));
    const [localAgents, setLocalAgents] = useState<Record<string, Partial<Agent>>>(storageService.getAgentOverrides());

    useEffect(() => {
        storageService.setDeletedIds(Array.from(deletedIds));
        storageService.setAgentOverrides(localAgents);
    }, [deletedIds, localAgents]);

    const rawAgents = importedAgents ?? remoteAgents;
    const sourceInfo = buildActiveSourceInfo(remoteSourceInfo, importedFileName);

    const effectiveAgents = useMemo(() => {
        return rawAgents
            .filter((agent) => !deletedIds.has(agent.id))
            .map((agent) => ({
                ...agent,
                ...(localAgents[agent.id] || {}),
            }));
    }, [rawAgents, deletedIds, localAgents]);

    const handleDeleteAgent = (id: string) => {
        setDeletedIds((prev) => new Set([...prev, id]));
    };

    const handleUpdateAgent = (id: string, updates: Partial<Agent>) => {
        setLocalAgents((prev) => ({
            ...prev,
            [id]: { ...(prev[id] || {}), ...updates },
        }));
    };

    const handleResetData = () => {
        if (confirm('Voulez-vous vraiment reinitialiser toutes les modifications locales ?')) {
            setDeletedIds(new Set());
            setLocalAgents({});
        }
    };

    const handleImportFile = async (file: File) => {
        const agents = await importAgentsFromFile(file);
        setImportedAgents(agents);
        setImportedFileName(file.name);
        setActiveView('orgchart');
    };

    const clearImportedSource = () => {
        setImportedAgents(null);
        setImportedFileName(null);
    };

    const applyCsvUrl = (nextUrl: string) => {
        clearImportedSource();
        setCsvUrl(nextUrl);
    };

    const poleDirectory = useMemo(() => buildPoleDirectory(effectiveAgents), [effectiveAgents]);

    const availablePoles = useMemo(() => poleDirectory.map((entry) => entry.pole), [poleDirectory]);

    const poleStateMap = useMemo(() => {
        const map = new Map<string, SelectedPoleState>();

        poleDirectory.forEach((entry) => {
            const agents = effectiveAgents.filter((agent) => getPoleKey(agent.pole || 'Sans pole') === entry.key);
            const tree = buildPoleHierarchy(agents);
            map.set(entry.key, {
                key: entry.key,
                pole: entry.pole,
                agents,
                tree,
            });
        });

        return map;
    }, [effectiveAgents, poleDirectory]);

    useEffect(() => {
        if (!poleDirectory.length) {
            setSelectedPoleKey(null);
            return;
        }

        if (!selectedPoleKey || !poleStateMap.has(selectedPoleKey)) {
            setSelectedPoleKey(poleDirectory[0]!.key);
        }
    }, [selectedPoleKey, poleDirectory, poleStateMap]);

    const selectedPole = useMemo(() => {
        return selectedPoleKey ? poleStateMap.get(selectedPoleKey) ?? null : null;
    }, [selectedPoleKey, poleStateMap]);

    const viewTree = useMemo(() => {
        const tree = Array.from(poleStateMap.values()).flatMap((poleState) => poleState.tree);
        computeTreeStats(tree);
        return tree;
    }, [poleStateMap]);

    const poleStats = useMemo(() => {
        let totalAgents = 0;
        let totalNbi = 0;
        let nbiCount = 0;

        const traverse = (nodes: TreeNode[]) => {
            nodes.forEach((node) => {
                totalAgents++;
                const nbiVal = parseNBI(node.nbi);
                if (nbiVal > 0) {
                    totalNbi += nbiVal;
                    nbiCount++;
                }
                if (node.children) traverse(node.children);
            });
        };

        traverse(viewTree);
        const avgNbi = nbiCount > 0 ? Math.round(totalNbi / nbiCount) : 0;

        return { totalAgents, avgNbi };
    }, [viewTree]);

    const agentPoleKeyMap = useMemo(() => {
        const map = new Map<string, string>();
        poleStateMap.forEach((poleState, key) => {
            poleState.agents.forEach((agent) => {
                map.set(agent.id, key);
            });
        });
        return map;
    }, [poleStateMap]);

    const [highlightedSearch, setHighlightedSearch] = useState<{ id: string | null; path: Set<string> }>({
        id: null,
        path: new Set(),
    });

    const focusAgentPole = (agentId: string) => {
        const poleKey = agentPoleKeyMap.get(agentId);
        if (poleKey) {
            setSelectedPoleKey(poleKey);
            setActiveView('orgchart');
        }
    };

    return {
        loading,
        activeView,
        setActiveView,
        error,
        refresh,
        csvUrl,
        sourceInfo,
        applyCsvUrl,
        rawAgents: effectiveAgents,
        viewTree,
        availablePoles,
        poleStats,
        highlightedSearch,
        setHighlightedSearch,
        isEditMode,
        setIsEditMode,
        handleDeleteAgent,
        handleUpdateAgent,
        handleResetData,
        handleImportFile,
        clearImportedSource,
        selectedPoleKey,
        setSelectedPoleKey,
        selectedPole,
        poleDirectory,
        focusAgentPole,
        isImportedSourceActive: Boolean(importedFileName),
    };
};
