import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useGoogleSheets } from './useGoogleSheets';
import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';
import { computeTreeStats, parseNBI } from '../utils/treeStats';
import { storageService } from '../services/storageService';
import type { CsvSourceInfo } from '../utils/csvSource';
import { buildPoleDirectory, getPoleKey } from '../utils/poleDirectory';
import { buildPoleHierarchy } from '../utils/poleHierarchy';
import { commitImport, previewImport, type ImportPreview } from '../services/importService';
import { findAgentPath } from '../utils/treeSearch';
import { useAppRoute } from '../routing/useAppRoute';
import { agentRepo } from '../services/agentRepo';
import { useWorkspaceContext } from '../contexts/WorkspaceContext';
import { usePermissions } from '../auth/usePermissions';
import { useFeedback } from '../feedback/FeedbackContext';
import { describeError } from '../utils/asyncGuard';

export type AppView = 'orgchart' | 'dashboard' | 'orchestration' | 'members' | 'api-keys' | 'settings';

export interface SelectedPoleState {
    key: string;
    pole: string;
    agents: Agent[];
    tree: TreeNode[];
}

export type AgentSaveResult =
    | { ok: true }
    | { ok: false; message: string };

/**
 * Référence de source stable pour un fichier importé.
 *
 * Elle cloisonne les fiches : deux fichiers différents ⇒ deux `sourceRef` ⇒
 * aucune collision d'identifiants possible entre eux.
 */
const normalizeSourceRef = (fileName: string): string =>
    fileName
        .replace(/\.(csv|xlsx|xls)$/i, '')
        .trim()
        .toLowerCase();

const buildActiveSourceInfo = (
    remoteSourceInfo: CsvSourceInfo,
    isServerBacked: boolean,
): CsvSourceInfo => {
    if (!isServerBacked) {
        return remoteSourceInfo;
    }

    return {
        inputUrl: '',
        effectiveUrl: '',
        isRemote: false,
        label: 'Organigramme enregistré',
        helperText: 'Les fiches proviennent des données enregistrées, pas du CSV.',
    };
};

export const useOrgChartController = () => {
    // L'URL porte desormais vue, pole, agent et mode edition : le parcours
    // survit au rafraichissement, le bouton Precedent fonctionne, et un lien
    // vers un agent precis est partageable.
    //
    // Les signatures exposees ci-dessous ne changent PAS (setActiveView,
    // setSelectedPoleKey, setIsEditMode gardent leur forme) : App.tsx et la
    // Sidebar n'ont pas a etre touches.
    const { route, navigate } = useAppRoute();

    const activeView = route.view;
    const setActiveView = useCallback(
        (view: AppView) => navigate({ view }),
        [navigate],
    );

    const selectedPoleKey = route.poleKey;
    const setSelectedPoleKey = useCallback(
        (key: string) => navigate({ poleKey: key }),
        [navigate],
    );

    const isEditMode = route.editMode;
    const setIsEditMode = useCallback(
        (next: boolean) => navigate({ editMode: next }),
        [navigate],
    );

    const [csvUrl, setCsvUrl] = useState(storageService.getCsvUrl());
    const { data: remoteAgents, loading, error, refresh, sourceInfo: remoteSourceInfo } = useGoogleSheets(csvUrl);
    useEffect(() => {
        storageService.setCsvUrl(csvUrl);
    }, [csvUrl]);

    const { activeId: workspaceId } = useWorkspaceContext();
    const repoCtx = useMemo(() => ({ workspaceId }), [workspaceId]);
    const { can, isAdmin } = usePermissions();
    const feedback = useFeedback();

    const peutEcrire = can('graph:write');
    const peutSupprimer = isAdmin;

    // ── Source de vérité ────────────────────────────────────────────────────
    // Les fiches persistées priment. Tant qu'il n'y en a aucune, on continue
    // d'afficher le CSV — en LECTURE SEULE — pour que l'application ne soit
    // jamais vide pendant la transition.
    const [serverAgents, setServerAgents] = useState<Agent[]>([]);
    const [agentsMeta, setAgentsMeta] = useState<{ stale: boolean; error?: string }>({ stale: false });
    const agentsVersionRef = useRef(0);

    const rechargerAgents = useCallback(async () => {
        const version = agentsVersionRef.current;
        const res = await agentRepo.list(repoCtx);
        if (version !== agentsVersionRef.current) return;
        setServerAgents(res.agents);
        setAgentsMeta({ stale: res.stale, ...(res.error ? { error: res.error } : {}) });
    }, [repoCtx]);

    useEffect(() => {
        void rechargerAgents();
    }, [rechargerAgents]);

    const isServerBacked = serverAgents.length > 0;
    const effectiveAgents = isServerBacked ? serverAgents : remoteAgents;
    const sourceInfo = buildActiveSourceInfo(remoteSourceInfo, isServerBacked);

    const preparePersistentSnapshot = async (): Promise<Agent[]> => {
        if (isServerBacked) return serverAgents;
        if (effectiveAgents.length === 0) return [];

        const sourceRef = csvUrl.trim() || 'embedded-csv';
        const snapshot = effectiveAgents.map((agent) => ({
            ...agent,
            sourceKind: 'remote_csv' as const,
            sourceRef,
            externalKey: agent.externalKey ?? agent.id,
        }));

        await agentRepo.bulkUpsert(snapshot, repoCtx, {
            sourceKind: 'remote_csv',
            sourceRef,
            mode: 'replace',
        });
        agentsVersionRef.current += 1;
        setServerAgents(snapshot);
        return snapshot;
    };

    // ── Écritures ───────────────────────────────────────────────────────────
    // Optimiste puis rollback : l'utilisateur voit son geste immédiatement, et
    // un échec le lui dit au lieu de le laisser croire que c'est enregistré.
    const handleUpdateAgent = async (
        id: string,
        updates: Partial<Agent>,
    ): Promise<AgentSaveResult> => {
        if (!peutEcrire) {
            return { ok: false, message: "Ton rôle ne permet pas de modifier l'organigramme." };
        }

        let base: Agent[];
        try {
            base = await preparePersistentSnapshot();
        } catch (err) {
            return { ok: false, message: `Préparation de la sauvegarde impossible : ${describeError(err)}` };
        }

        const cible = base.find((a) => a.id === id);
        if (!cible) return { ok: false, message: 'Cette fiche est introuvable.' };

        const fusionne: Agent = { ...cible, ...updates };
        const suivant = base.map((a) => (a.id === id ? fusionne : a));
        setServerAgents(suivant);

        try {
            await agentRepo.upsert(fusionne, repoCtx);
            return { ok: true };
        } catch (err) {
            setServerAgents(base);
            return { ok: false, message: `Modification non enregistrée : ${describeError(err)}` };
        }
    };

    const handleDeleteAgent = async (id: string) => {
        if (!peutSupprimer) {
            feedback.error('Seuls les administrateurs peuvent retirer une fiche.');
            return;
        }
        const cible = effectiveAgents.find((a) => a.id === id);
        if (!cible) return;

        // Même règle que le trigger serveur : adoption par le grand-parent.
        const enfants = effectiveAgents.filter((a) => a.rattachementId === id);
        const question = enfants.length
            ? `Retirer ${cible.prenom} ${cible.nom} ? ${enfants.length} collaborateur(s) seront rattaché(s) à son supérieur.`
            : `Retirer ${cible.prenom} ${cible.nom} de l'organigramme ?`;
        if (!confirm(question)) return;

        let base: Agent[];
        try {
            base = await preparePersistentSnapshot();
        } catch (err) {
            feedback.error(`Suppression non effectuée : ${describeError(err)}`);
            return;
        }
        const suivant = base
            .filter((a) => a.id !== id)
            .map((a) => (a.rattachementId === id ? { ...a, rattachementId: cible.rattachementId } : a));
        setServerAgents(suivant);

        try {
            await agentRepo.remove(id, repoCtx);
            feedback.success(`${cible.prenom} ${cible.nom} retiré de l'organigramme.`);
        } catch (err) {
            setServerAgents(base);
            feedback.error(`Suppression non enregistrée : ${describeError(err)}`);
        }
    };

    /** Vide les fiches RH — ce n'est plus une purge de surcharges locales. */
    const handleResetData = async () => {
        if (!peutSupprimer) {
            feedback.error("Seuls les administrateurs peuvent vider l'organigramme.");
            return;
        }
        if (!isServerBacked) {
            feedback.info('Aucune fiche enregistrée à supprimer.');
            return;
        }
        if (
            !confirm(
                `Supprimer les ${serverAgents.length} fiches enregistrées ? Cette action est irréversible.`,
            )
        ) {
            return;
        }
        try {
            const supprimes = await agentRepo.clearWorkspace(repoCtx);
            setServerAgents([]);
            feedback.success(`${supprimes} fiche(s) supprimée(s).`);
        } catch (err) {
            feedback.error(`Suppression non effectuée : ${describeError(err)}`);
        }
    };

    // ── Import en deux temps : prévisualisation puis confirmation ───────────
    const [importPreview, setImportPreview] = useState<{ fileName: string; preview: ImportPreview } | null>(
        null,
    );
    const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
    const [allowInvalidImport, setAllowInvalidImport] = useState(false);
    const [isCommittingImport, setIsCommittingImport] = useState(false);
    const [importCommitError, setImportCommitError] = useState<string | null>(null);

    /** N'applique plus le fichier : ouvre la prévisualisation. */
    const handleImportFile = async (file: File) => {
        const preview = await previewImport(file);
        setImportPreview({ fileName: file.name, preview });
        setImportMode('merge');
        setAllowInvalidImport(false);
        setImportCommitError(null);
    };

    const cancelImport = () => {
        setImportPreview(null);
        setImportCommitError(null);
    };

    const confirmImport = async () => {
        if (!importPreview) return;
        setIsCommittingImport(true);
        setImportCommitError(null);

        try {
            const agents = commitImport(importPreview.preview, { allowInvalid: allowInvalidImport });
            const sourceRef = normalizeSourceRef(importPreview.fileName);
            // La provenance est portée par chaque fiche : c'est elle qui rend
            // les identifiants stables et cloisonnés par source.
            const marques: Agent[] = agents.map((a) => ({
                ...a,
                sourceKind: 'import',
                sourceRef,
                externalKey: a.externalKey ?? a.id,
            }));

            const bilan = await agentRepo.bulkUpsert(marques, repoCtx, {
                sourceKind: 'import',
                sourceRef,
                mode: importMode,
            });

            await rechargerAgents();
            setImportPreview(null);
            setActiveView('orgchart');
            feedback.success(
                `Import terminé : ${bilan.inserted} ajoutée(s), ${bilan.updated} mise(s) à jour` +
                    (bilan.deleted ? `, ${bilan.deleted} retirée(s)` : '') +
                    '.',
            );
        } catch (err) {
            setImportCommitError(describeError(err));
        } finally {
            setIsCommittingImport(false);
        }
    };

    const applyCsvUrl = (nextUrl: string) => {
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
            if (selectedPoleKey) navigate({ poleKey: null }, { replace: true });
            return;
        }

        if (!selectedPoleKey || !poleStateMap.has(selectedPoleKey)) {
            // `replace` : la sélection AUTOMATIQUE du premier pôle ne doit pas
            // polluer l'historique, sinon « Précédent » devient inutilisable.
            navigate({ poleKey: poleDirectory[0]!.key }, { replace: true });
        }
    }, [selectedPoleKey, poleDirectory, poleStateMap, navigate]);

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

    /**
     * Lien profond : `?agent=<id>` doit déplier la branche et surligner l'agent,
     * y compris dans un onglet neuf. `locateAgent` ne couvre que le cas « déjà
     * chargé » ; sans cet ajustement, l'URL affichait le bon pôle sans rien
     * mettre en évidence. Ajustement d'état pendant le rendu, une seule fois par
     * changement d'identifiant.
     */
    const [syncedAgentId, setSyncedAgentId] = useState<string | null>(route.agentId);
    if (syncedAgentId !== route.agentId) {
        setSyncedAgentId(route.agentId);
        if (route.agentId && viewTree.length > 0) {
            const path = findAgentPath(viewTree, route.agentId);
            setHighlightedSearch({ id: route.agentId, path: new Set(path ?? [route.agentId]) });
        }
    }

    const focusAgentPole = (agentId: string) => {
        const poleKey = agentPoleKeyMap.get(agentId);
        // Une seule navigation au lieu de deux setState : plus de rendu
        // intermédiaire où la vue et le pôle sont désaccordés.
        if (poleKey) navigate({ view: 'orgchart', poleKey });
    };

    /**
     * Localise un agent dans l'organigramme : bascule sur son pole, deplie la
     * branche jusqu'a lui et le met en evidence.
     *
     * Equivalent programmatique de la selection Spotlight, pour les appelants qui
     * ne connaissent que l'identifiant (fiche profil, liens entrants...).
     * Retourne false si l'agent est introuvable dans l'arbre courant.
     */
    const locateAgent = (agentId: string): boolean => {
        const poleKey = agentPoleKeyMap.get(agentId);
        if (!poleKey) return false;

        const path = findAgentPath(viewTree, agentId);
        navigate({ view: 'orgchart', poleKey, agentId });
        setHighlightedSearch({ id: agentId, path: new Set(path ?? [agentId]) });
        return true;
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
        selectedPoleKey,
        setSelectedPoleKey,
        selectedPole,
        poleDirectory,
        focusAgentPole,
        locateAgent,

        // ── Import en deux temps ────────────────────────────────────────────
        importPreview,
        importMode,
        setImportMode,
        allowInvalidImport,
        setAllowInvalidImport,
        isCommittingImport,
        importCommitError,
        confirmImport,
        cancelImport,

        // ── État de la source ───────────────────────────────────────────────
        /** `true` ⇒ les fiches viennent des données enregistrées, pas du CSV. */
        isServerBacked,
        /** Lecture distante en échec : on montre un cache, il faut le dire. */
        agentsStale: agentsMeta.stale,
        agentsError: agentsMeta.error ?? null,
        canEditAgents: peutEcrire,
        canDeleteAgents: peutSupprimer,
    };
};
