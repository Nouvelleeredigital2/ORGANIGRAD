import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HybridNodeCard from '../HybridNodeCard';
import { ConnectorSVG } from '../ConnectorSVG';
import { ValidationCenter, type ValidationItem } from '../ValidationCenter';
import { MCPAnchorsOverlay } from '../MCPAnchorsOverlay';
import { HybridSpotlight } from '../spotlight/HybridSpotlight';
import { NodeEditor } from '../NodeEditor';
import { NodeDetailsModal } from '../NodeDetailsModal';
import { ActivityLog } from '../ActivityLog';
import { Button, Kbd } from '../../design/ui';
import { Z } from '../../design/tokens';
import type { HybridNode, NodeStatus, NodeType } from '../../types/hybridNode';
import type { Agent } from '../../types/agent';
import { agentToHybridNode } from '../../utils/agentToHybridNode';
import { hybridNodeStore } from '../../services/hybridNodeStore';
import { hybridNodeRepo } from '../../services/hybridNodeRepo';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { notifyHuman, NOTIFICATION_EVENT } from '../../services/notificationService';
import type { NotificationEventDetail } from '../../services/notificationService';
import { emitActivity, emitTransition } from '../../services/activityBus';
import { useOrchestratorBridge } from '../../hooks/useOrchestratorBridge';
import { useOrchestratorConfig } from '../../hooks/useOrchestratorConfig';
import { useFeedback } from '../../feedback/FeedbackContext';
import { usePermissions } from '../../auth/usePermissions';
import { messageErreurUtilisateur } from '../../utils/asyncGuard';

interface OrchestrationViewProps {
    rawAgents: Agent[];
}

/**
 * Horodatage relatif d'une demande de validation.
 *
 * Sans cela, le Centre de validation affichait « à l'instant » en dur : une
 * demande vieille de plusieurs heures paraissait toute fraîche.
 */
const formatRelative = (timestamp: number | undefined): string => {
    if (!timestamp) return '—';
    const minutes = Math.floor((Date.now() - timestamp) / 60_000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    return `il y a ${Math.floor(hours / 24)} j`;
};

/**
 * OrchestrationView — vue de coordination Humain · IA · MCP.
 *
 * Démarre VIERGE : aucun seed, aucun nœud factice, aucun humain par défaut.
 * Les nœuds proviennent uniquement de :
 *   - `hybridNodeStore` (créations utilisateur persistées en localStorage)
 *   - `rawAgents` (CSV chargé via Paramètres) → adapté en HUMAN via `agentToHybridNode`
 *
 * Tant que rien n'a été créé/importé, on affiche un état vide guidant
 * l'utilisateur vers les actions Nouveau nœud / Importer CSV.
 */
export const OrchestrationView: React.FC<OrchestrationViewProps> = ({ rawAgents }) => {
    const { activeId: workspaceId } = useWorkspaceContext();
    const [hybridSource, setHybridSource] = useState<HybridNode[]>(() =>
        hybridNodeStore.list(workspaceId),
    );
    // « loading » n'a de sens que s'il y a une source distante à attendre : en
    // mode local, la liste vient de localStorage, donc immédiatement.
    const [dataState, setDataState] = useState<'loading' | 'ready' | 'stale'>(() =>
        workspaceId ? 'loading' : 'ready',
    );
    const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
    /** Date de dernière transition locale, pour dater les demandes de validation. */
    const [statusTimestamps, setStatusTimestamps] = useState<Record<string, number>>({});
    // Miroir synchrone de `statuses` : permet de lire le statut courant sans
    // effet de bord dans un updater setState (cf. setStatusFor).
    const statusesRef = useRef<Record<string, NodeStatus>>({});
    const feedback = useFeedback();
    // Les commandes mutantes sont filtrées par rôle : proposer une action qui
    // finira en 403 muet est pire que ne pas la proposer.
    const { can, role, isLocalMode } = usePermissions();
    const peutEcrire = can('graph:write');
    const peutLancer = can('node:run');
    const peutValider = can('human:approve');
    const peutReinitialiser = can('node:reset');

    // Pont vers l'orchestrateur backend (config dans Paramètres).
    // Quand `bridge.connected`, on délègue run/approve/reject au service distant
    // et on observe les statuts via SSE plutôt que de simuler localement.
    const bridge = useOrchestratorBridge();
    // Proxy vocal (SDK @apps2026/voice-client) : dérivé de l'URL de l'orchestrateur
    // (ex. http://localhost:3001/api → http://localhost:3001/api/voice/gateway).
    // Sans orchestrateur configuré, pas de bouton micro.
    const { config: orchestratorConfig, isConfigured: orchestratorConfigured } = useOrchestratorConfig();
    const voiceProxyBasePath = orchestratorConfig.baseUrl
        ? `${orchestratorConfig.baseUrl.replace(/\/+$/, '')}/voice/gateway`
        : undefined;

    // Cloisonnement : au changement de workspace, on repart IMMÉDIATEMENT du
    // cache namespacé de CE workspace (jamais celui du précédent). Ajustement
    // d'état PENDANT le rendu — même motif que NodeEditor — plutôt qu'un
    // setState synchrone dans un effet.
    const [syncedWorkspaceId, setSyncedWorkspaceId] = useState(workspaceId);
    if (syncedWorkspaceId !== workspaceId) {
        setSyncedWorkspaceId(workspaceId);
        setHybridSource(hybridNodeStore.list(workspaceId));
        setStatuses({});
        setStatusTimestamps({});
        setDataState(workspaceId ? 'loading' : 'ready');
    }

    // Miroir du state, resynchronisé après chaque commit (y compris les remises
    // à zéro). Un ref ne peut pas être muté pendant le rendu.
    useEffect(() => {
        statusesRef.current = statuses;
    }, [statuses]);

    // Charge depuis Supabase quand on a un workspace + souscrit aux changements live
    useEffect(() => {
        let cancelled = false;
        void hybridNodeRepo.list({ workspaceId }).then((res) => {
            if (cancelled) return;
            setHybridSource(res.nodes);
            setDataState(res.stale ? 'stale' : 'ready');
        });
        const off = hybridNodeRepo.subscribe({ workspaceId }, (event, node) => {
            setHybridSource((prev) => {
                if (event === 'DELETE') return prev.filter((n) => n.id !== node.id);
                const idx = prev.findIndex((n) => n.id === node.id);
                if (idx === -1) return [...prev, node as HybridNode];
                return prev.map((n, i) => (i === idx ? (node as HybridNode) : n));
            });
        });
        return () => {
            cancelled = true;
            off();
        };
    }, [workspaceId]);
    const [isRunning, setIsRunning] = useState(false);
    const [validationOpen, setValidationOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorNode, setEditorNode] = useState<HybridNode | null>(null);
    const [toast, setToast] = useState<NotificationEventDetail | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    /** Nœud dont on consulte le détail depuis le Centre de validation. */
    const [detailsNode, setDetailsNode] = useState<HybridNode | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const spotlightRef = useRef<HTMLDivElement>(null);

    // Source de nœuds : merge { humains CSV } ∪ { nœuds hybrides Supabase }.
    // Statuts : ceux du bridge SSE quand connecté > statuts locaux > statut DB.
    const allNodes = useMemo<HybridNode[]>(() => {
        const humansFromCsv: HybridNode[] = rawAgents.map((a) => agentToHybridNode(a));
        // Déduplication par identifiant : `agentToHybridNode` conserve l'id de
        // l'agent, si bien qu'éditer un humain issu du CSV produisait DEUX
        // cartes — celle du CSV (valeurs anciennes) et la version enregistrée,
        // rendues avec la même clé React. Le CSV n'est qu'une graine : la
        // version enregistrée prime.
        const byId = new Map<string, HybridNode>();
        humansFromCsv.forEach((n) => byId.set(n.id, n));
        hybridSource.forEach((n) => byId.set(n.id, n));
        const merged = Array.from(byId.values());

        const bridgeStatusById = bridge.connected
            ? new Map(bridge.nodes.map((n) => [n.id, n.status]))
            : null;
        return merged.map((n) => ({
            ...n,
            status: bridgeStatusById?.get(n.id) ?? statuses[n.id] ?? n.status,
        }));
    }, [hybridSource, rawAgents, statuses, bridge.connected, bridge.nodes]);

    const hasAnyNode = allNodes.length > 0;
    /** Seuls les nœuds enregistrés se suppriment ici (le CSV est une graine). */
    const deletableIds = useMemo(() => new Set(hybridSource.map((n) => n.id)), [hybridSource]);
    const pendingItems: ValidationItem[] = useMemo(
        () =>
            allNodes
                .filter((n) => n.type === 'HUMAN' && n.status === 'WAITING_HUMAN_APPROVAL')
                .map((n) => {
                    const upstream = allNodes.filter((u) => u.parentID && u.parentID === n.id);
                    return {
                        node: n,
                        what: 'Livrable en attente',
                        detail: upstream.length
                            ? upstream.map((u) => u.nom).join(' → ')
                            : undefined,
                        when: formatRelative(statusTimestamps[n.id]),
                    };
                }),
        [allNodes, statusTimestamps],
    );

    // Notifications toast
    useEffect(() => {
        const handler = (e: Event) => {
            setToast((e as CustomEvent<NotificationEventDetail>).detail);
            setTimeout(() => setToast(null), 4500);
        };
        window.addEventListener(NOTIFICATION_EVENT, handler);
        return () => window.removeEventListener(NOTIFICATION_EVENT, handler);
    }, []);

    // Ping humain quand un nœud HUMAN passe en attente d'approbation.
    // Dédupliqué : `pendingItems` est recalculé à CHAQUE transition de n'importe
    // quel nœud, ce qui re-POSTait le webhook Slack en boucle.
    const notifiedRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const stillPending = new Set(pendingItems.map((item) => item.node.id));
        // Un nœud sorti de l'attente redevient notifiable pour la fois suivante.
        notifiedRef.current.forEach((id) => {
            if (!stillPending.has(id)) notifiedRef.current.delete(id);
        });

        pendingItems.forEach((item) => {
            if (notifiedRef.current.has(item.node.id)) return;
            notifiedRef.current.add(item.node.id);
            void notifyHuman({
                node: item.node,
                message: 'Livrable prêt à valider',
            });
        });
    }, [pendingItems]);

    // ⌘K — focus du Spotlight
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const input = spotlightRef.current?.querySelector('input');
                input?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const setStatusFor = useCallback((n: HybridNode, next: NodeStatus) => {
        const from = statusesRef.current[n.id] ?? n.status;
        if (from === next) return;

        statusesRef.current = { ...statusesRef.current, [n.id]: next };
        setStatuses(statusesRef.current);
        setStatusTimestamps((prev) => ({ ...prev, [n.id]: Date.now() }));
        // Émission HORS de l'updater : un effet de bord dans une fonction de
        // mise à jour est rejoué en mode strict et dupliquait le journal.
        emitTransition(n, from, next);
    }, []);

    const resetStatuses = useCallback(() => {
        statusesRef.current = {};
        setStatuses({});
        setStatusTimestamps({});
    }, []);

    /**
     * Lance la chaîne :
     *   - Mode orchestrateur (bridge connecté) : POST /api/nodes/:root/run.
     *     Les transitions reviennent via SSE et alimentent `bridge.nodes`.
     *   - Mode local (offline / non connecté) : simulation chronométrée.
     */
    const runChain = async () => {
        // TOUTES les racines, pas seulement la première : les humains issus du
        // CSV sont concaténés en tête, si bien que les nœuds IA créés par
        // l'utilisateur — également racines — n'étaient jamais lancés.
        const roots = allNodes.filter((n) => !n.parentID);
        if (roots.length === 0) return;

        setIsRunning(true);

        if (bridge.connected) {
            roots.forEach((root) =>
                emitActivity({
                    kind: 'run',
                    nodeId: root.id,
                    nodeName: root.nom,
                    message: 'Démarrage de la chaîne',
                }),
            );

            const results = await Promise.allSettled(roots.map((root) => bridge.runFlow(root.id)));
            setIsRunning(false);

            const failed = results.flatMap((r, i) =>
                r.status === 'rejected' ? [{ nom: roots[i]!.nom, error: messageErreurUtilisateur(r.reason) }] : [],
            );

            if (failed.length === 0) {
                feedback.success(
                    `Chaîne lancée : ${roots.length} racine${roots.length > 1 ? 's' : ''}.`,
                );
            } else if (failed.length === roots.length) {
                feedback.error(`Lancement échoué : ${failed[0]!.error}. Aucune chaîne n'a démarré.`);
            } else {
                feedback.warning(
                    `Lancement partiel : ${roots.length - failed.length}/${roots.length} chaînes démarrées. Échecs : ${failed.map((f) => f.nom).join(', ')}.`,
                );
            }
            return;
        }

        if (bridge.connectionState !== 'local') {
            setIsRunning(false);
            feedback.error('Orchestrateur indisponible : la chaîne n\'a pas été simulée. Vérifiez la connexion dans Paramètres.');
            return;
        }

        // --- Simulation locale (sans orchestrateur) ---
        resetStatuses();
        roots.forEach((root) =>
            emitActivity({
                kind: 'run',
                nodeId: root.id,
                nodeName: root.nom,
                message: 'Démarrage de la chaîne',
            }),
        );

        // `visited` partagé entre les racines : un nœud rattaché à deux racines
        // n'est parcouru qu'une fois.
        const visited = new Set<string>();
        const order = roots.flatMap((root) =>
            topoSort(allNodes, root.id).filter((n) => {
                if (visited.has(n.id)) return false;
                visited.add(n.id);
                return true;
            }),
        );
        if (order.length === 0) { setIsRunning(false); return; }

        let delay = 0;
        order.forEach((n) => {
            if (n.type === 'HUMAN') {
                setTimeout(() => setStatusFor(n, 'WAITING_HUMAN_APPROVAL'), delay);
                delay += 200;
                return;
            }
            const isVerifier = n.type === 'SOFTWARE_MCP';
            const exec = isVerifier ? 'CONTROL_PENDING_IA' : 'EXECUTING';
            setTimeout(() => setStatusFor(n, exec), delay);
            delay += 900;
            setTimeout(() => setStatusFor(n, 'IDLE'), delay);
            delay += 200;
        });
        // Fin de simulation : réactive le bouton après le dernier timeout
        setTimeout(() => setIsRunning(false), delay + 100);
    };

    /**
     * Wrapper centralisant approve/reject/reset : délègue au bridge si connecté.
     * Sinon, mute le statut local via la machine à états.
     */
    const approveNode = useCallback(
        async (n: HybridNode): Promise<boolean> => {
            if (bridge.connected) {
                try {
                    await bridge.approve(n.id);
                    feedback.success(`Validation transmise · ${n.nom}.`);
                    return true;
                } catch (err) {
                    console.error('[OrchestrationView] approve failed', err);
                    feedback.error(`Validation non enregistrée · ${n.nom} : ${messageErreurUtilisateur(err)}`);
                    return false;
                }
            }
            setStatusFor(n, 'IDLE');
            return true;
        },
        [bridge, setStatusFor, feedback],
    );

    const rejectNode = useCallback(
        async (n: HybridNode, motif: string): Promise<boolean> => {
            if (bridge.connected) {
                try {
                    await bridge.reject(n.id, motif);
                    feedback.success(`Rejet transmis · ${n.nom}.`);
                    return true;
                } catch (err) {
                    console.error('[OrchestrationView] reject failed', err);
                    // Le motif saisi est conservé : le panneau reste ouvert.
                    feedback.error(`Rejet non enregistré · ${n.nom} : ${messageErreurUtilisateur(err)}`);
                    return false;
                }
            }
            setStatusFor(n, 'ERROR');
            return true;
        },
        [bridge, setStatusFor, feedback],
    );

    /**
     * Exécute un nœud isolé. En mode local, le nœud DOIT ressortir d'EXECUTING :
     * il y restait bloqué indéfiniment, la carte affichant « Exécution » à vie.
     */
    const runNode = useCallback(
        async (n: HybridNode): Promise<void> => {
            if (bridge.connected) {
                try {
                    await bridge.runNode(n.id);
                    feedback.success(`Exécution lancée · ${n.nom}.`);
                } catch (err) {
                    console.error('[OrchestrationView] runNode failed', err);
                    feedback.error(`Exécution non lancée · ${n.nom} : ${messageErreurUtilisateur(err)}`);
                }
                return;
            }
            setStatusFor(n, 'EXECUTING');
            setTimeout(() => setStatusFor(n, 'IDLE'), 900);
        },
        [bridge, setStatusFor, feedback],
    );

    /** Remet les statuts à zéro — côté orchestrateur aussi quand il est branché. */
    const resetChain = useCallback(async (): Promise<void> => {
        setIsRunning(false);

        if (!bridge.connected) {
            resetStatuses();
            return;
        }

        // En mode connecté, vider l'état local n'a aucun effet visible : les
        // statuts affichés viennent du bridge. Il faut réinitialiser les nœuds.
        const roots = allNodes.filter((n) => !n.parentID);
        const results = await Promise.allSettled(roots.map((root) => bridge.reset(root.id)));
        resetStatuses();

        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed === 0) {
            feedback.success('Chaîne réinitialisée.');
        } else {
            feedback.error(
                `Réinitialisation incomplète : ${failed}/${roots.length} racines n'ont pas répondu.`,
            );
        }
    }, [bridge, allNodes, resetStatuses, feedback]);

    /**
     * Supprime un nœud. `hybridNodeRepo.remove` existait sans aucun appelant :
     * un nœud créé par erreur ne pouvait être retiré par AUCUN chemin de
     * l'interface. Réservé aux nœuds enregistrés — les humains issus du CSV ne
     * sont qu'une graine de lecture, ils se retirent depuis l'organigramme.
     */
    const handleDeleteNode = async (node: HybridNode) => {
        const avant = hybridSource;
        setHybridSource((prev) => prev.filter((n) => n.id !== node.id));

        try {
            await hybridNodeRepo.remove(node.id, {
                workspaceId,
                orchestratorClient: bridge.client,
            });
            emitActivity({
                kind: 'delete',
                nodeId: node.id,
                nodeName: node.nom,
                message: 'Nœud supprimé',
            });
            feedback.success(`Nœud supprimé · ${node.nom}.`);
        } catch (err) {
            setHybridSource(avant);
            feedback.error(`Suppression non enregistrée · ${node.nom} : ${messageErreurUtilisateur(err)}`);
        }
    };

    const handleSaveNode = async (node: HybridNode) => {
        if (!peutEcrire) {
            setSaveError('Votre rôle ne permet pas de modifier les nœuds.');
            return;
        }
        // Orchestrateur configuré mais client absent (sonde en cours ou
        // échouée) : on REFUSE d'écrire au lieu de retomber en silence sur
        // l'écriture Supabase directe — celle-ci stockerait systemPrompt,
        // mcpConfig et webhooks EN CLAIR, précisément ce que le routage via
        // l'orchestrateur ferme. Même règle que runChain pour la simulation.
        if (orchestratorConfigured && !bridge.client) {
            setSaveError(
                bridge.connectionState === 'failed' || bridge.connectionState === 'degraded'
                    ? "Orchestrateur injoignable : enregistrement refusé pour ne pas stocker les secrets en clair. Vérifiez la connexion dans Paramètres, ou déconnectez l'orchestrateur pour travailler en local."
                    : "Connexion à l'orchestrateur en cours : réessayez dans un instant.",
            );
            return;
        }
        const exists = hybridSource.some((n) => n.id === node.id);
        try {
            // `orchestratorClient` route l'écriture via l'orchestrateur, qui
            // chiffre les secrets avant stockage. Sans lui, la SPA écrivait
            // directement dans Supabase — prompts et webhooks en clair.
            const saved = await hybridNodeRepo.upsert(node, {
                workspaceId,
                orchestratorClient: bridge.client,
            });
            // Optimistic local update — realtime fera le merge si workspace branché
            setHybridSource((prev) => {
                const idx = prev.findIndex((n) => n.id === saved.id);
                return idx === -1 ? [...prev, saved] : prev.map((n, i) => (i === idx ? saved : n));
            });
            emitActivity({
                kind: exists ? 'edit' : 'create',
                nodeId: saved.id,
                nodeName: saved.nom,
                message: exists ? 'Nœud mis à jour' : 'Nœud créé',
            });
            setSaveError(null);
            setEditorOpen(false);
            setEditorNode(null);
        } catch (err) {
            console.error('[OrchestrationView] save failed', err);
            setSaveError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
            // L'éditeur RESTE ouvert : le refermer ferait perdre la saisie et
            // laisserait croire que l'enregistrement a abouti.
        }
    };

    const groups = useMemo(() => groupByType(allNodes), [allNodes]);

    return (
        <div className="relative w-full overflow-y-auto p-4 pt-16 sm:p-6 lg:p-10 lg:pt-10">
            {dataState === 'stale' && (
                <div
                    role="status"
                    className="mb-4 rounded-xl px-4 py-2.5 text-[13px]"
                    style={{
                        background: 'rgba(255,149,0,0.08)',
                        color: 'var(--system-orange, #b25e00)',
                        boxShadow: 'inset 0 0 0 1px rgba(255,149,0,0.3)',
                    }}
                >
                    Connexion au serveur impossible — données affichées potentiellement obsolètes
                    (dernier cache de ce workspace).
                </div>
            )}
            <header className="mb-6 flex flex-col gap-4 sm:gap-6 lg:mb-8 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="eyebrow">Chaîne hybride</p>
                    <h1 className="t-display mt-2" style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}>
                        Orchestration.
                    </h1>
                    <p className="t-body mt-2 max-w-2xl">
                        Humain, IA autonome, logiciels MCP — un fil unique, des responsabilités séparées.
                        Raccourci <Kbd>⌘K</Kbd> pour le Spotlight.
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[11px]">
                        <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                                background: bridge.connectionState === 'failed'
                                    ? 'var(--system-red)'
                                    : bridge.connectionState === 'degraded'
                                      ? 'var(--system-orange)'
                                      : bridge.connectionState === 'connecting'
                                        ? 'var(--system-blue)'
                                        : bridge.connected
                                    ? 'var(--system-green)'
                                    : 'var(--ink-5)',
                            }}
                        />
                        <span style={{ color: 'var(--fg-3)' }}>
                            {bridge.connectionState === 'failed'
                                ? 'Orchestrateur indisponible · aucune simulation ne sera lancée'
                                : bridge.connectionState === 'degraded'
                                  ? 'Orchestrateur dégradé · flux interrompu, données possiblement obsolètes'
                                  : bridge.connectionState === 'connecting'
                                    ? 'Connexion à l\'orchestrateur…'
                                    : bridge.connected
                                ? 'Orchestrateur connecté · transitions distribuées'
                                : 'Mode local · transitions simulées (configurer l\'orchestrateur dans Paramètres)'}
                        </span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <Button
                            tone="blue"
                            onClick={() => void runChain()}
                            disabled={!hasAnyNode || isRunning || !peutLancer}
                        >
                            {isRunning ? (
                                <span className="flex items-center gap-2">
                                    <span
                                        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white"
                                        aria-hidden
                                    />
                                    En cours…
                                </span>
                            ) : (
                                'Lancer la chaîne'
                            )}
                        </Button>
                        <Button
                            tone="slate"
                            variant="soft"
                            onClick={() => void resetChain()}
                            disabled={!hasAnyNode || !peutReinitialiser}
                        >
                            Réinitialiser
                        </Button>
                        <Button
                            tone="slate"
                            variant="soft"
                            disabled={!peutEcrire}
                            onClick={() => {
                                setEditorNode(null);
                                setEditorOpen(true);
                            }}
                        >
                            Nouveau nœud
                        </Button>
                    </div>

                    {/* Masquer sans expliquer laisse l'utilisateur devant une
                        interface inerte sans savoir pourquoi. */}
                    {!isLocalMode && !peutEcrire && (
                        <p className="mt-3 text-xs font-medium text-slate-500">
                            Ton rôle ({role ?? 'inconnu'}) donne un accès en lecture seule : la
                            création, l'édition et l'exécution de nœuds sont réservées aux membres
                            du workspace.
                        </p>
                    )}
                </div>

                <div ref={spotlightRef}>
                    <HybridSpotlight
                        nodes={allNodes}
                        onSelect={(n) => {
                            const el = stageRef.current?.querySelector<HTMLElement>(
                                `[data-node-id="${n.id}"]`,
                            );
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el?.classList.add('ring-2', 'ring-sky-400');
                            setTimeout(
                                () => el?.classList.remove('ring-2', 'ring-sky-400'),
                                1800,
                            );
                        }}
                    />
                </div>
            </header>

            {saveError && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
                    <span>{saveError}</span>
                    <button type="button" onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600">✕</button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
                <section
                    ref={stageRef}
                    className="relative rounded-3xl border border-slate-100 bg-slate-50/50 p-4 sm:p-6 lg:p-8 min-h-[300px]"
                >
                    {dataState === 'loading' && !hasAnyNode ? (
                        /* Sans cet état, on affichait « Aucun nœud dans la chaîne »
                           pendant tout l'aller-retour Supabase — l'utilisateur
                           croyait son workspace vide. */
                        <div className="flex min-h-[240px] items-center justify-center">
                            <p className="text-sm font-medium text-slate-400">Chargement des nœuds…</p>
                        </div>
                    ) : !hasAnyNode ? (
                        <EmptyState onCreate={() => setEditorOpen(true)} canCreate={peutEcrire} />
                    ) : (
                        <>
                            <MCPAnchorsOverlay containerRef={stageRef} nodes={allNodes} />
                            <div className="relative z-10 flex flex-col items-center gap-10">
                                {groups.map(({ kicker, label, nodes }) =>
                                    nodes.length === 0 ? null : (
                                        <NodeGroup
                                            key={kicker}
                                            kicker={kicker}
                                            label={label}
                                            nodes={nodes}
                                            // Ouvrir la fiche. Auparavant, cliquer
                                            // une carte faisait DÉFILER son statut :
                                            // fausse transition au journal et vraie
                                            // notification Slack déclenchée par un clic.
                                            onOpen={(n) => {
                                                setEditorNode(n);
                                                setEditorOpen(true);
                                            }}
                                            onRun={peutLancer ? (n) => void runNode(n) : undefined}
                                            onEdit={
                                                peutEcrire
                                                    ? (n) => {
                                                          setEditorNode(n);
                                                          setEditorOpen(true);
                                                      }
                                                    : undefined
                                            }
                                            onDelete={peutEcrire ? (n) => void handleDeleteNode(n) : undefined}
                                            // Seuls les nœuds enregistrés sont
                                            // supprimables ici (cf. handleDeleteNode).
                                            deletableIds={deletableIds}
                                            onValidate={
                                                peutValider ? () => setValidationOpen(true) : undefined
                                            }
                                            pendingCount={pendingItems.length}
                                        />
                                    ),
                                )}
                            </div>
                        </>
                    )}
                </section>

                <aside className="h-[420px] lg:h-[700px]">
                    <ActivityLog />
                </aside>
            </div>

            {toast && (
                <div
                    // Une notification doit être annoncée aux lecteurs d'écran.
                    role="status"
                    className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 ${Z.toast} max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-2xl border border-amber-200 bg-white p-4 shadow-[0_20px_60px_-10px_rgba(245,158,11,0.4)]`}
                >
                    <p
                        className="text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--system-yellow)' }}
                    >
                        Validation requise
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{toast.node.nom}</p>
                    <p className="mt-1 text-xs text-slate-500">{toast.message}</p>
                    <p className="mt-2 text-[10px] text-slate-400">
                        {/* On distingue ce qui est réellement parti de ce qui a
                            échoué et de ce qui ne part pas depuis le navigateur. */}
                        {toast.channels.length > 0
                            ? `Envoyé : ${toast.channels.map((c) => c.key).join(', ')}`
                            : 'Aucun canal joint depuis le navigateur'}
                        {toast.failed.length > 0 && ` · Échec : ${toast.failed.map((c) => c.key).join(', ')}`}
                        {toast.deferred.length > 0 &&
                            ` · Délégué : ${toast.deferred.map((c) => c.key).join(', ')}`}
                    </p>
                </div>
            )}

            <NodeDetailsModal
                node={detailsNode}
                workspaceId={workspaceId}
                onClose={() => setDetailsNode(null)}
            />

            <ValidationCenter
                isOpen={validationOpen}
                items={pendingItems}
                onClose={() => setValidationOpen(false)}
                mode={bridge.connected ? 'remote' : 'local'}
                voiceProxyBasePath={voiceProxyBasePath}
                onShowDetails={(node) => setDetailsNode(node)}
                onApprove={async (node) => {
                    // Le panneau ne se referme qu'au SUCCÈS : le refermer sur un
                    // échec ferait croire que la décision a été enregistrée.
                    const ok = await approveNode(node);
                    if (ok && pendingItems.length <= 1) setValidationOpen(false);
                    return ok;
                }}
                onReject={async (node, motif) => {
                    const ok = await rejectNode(node, motif);
                    if (ok && pendingItems.length <= 1) setValidationOpen(false);
                    return ok;
                }}
            />

            <NodeEditor
                isOpen={editorOpen}
                node={editorNode}
                availableNodes={allNodes}
                onClose={() => {
                    setEditorOpen(false);
                    setEditorNode(null);
                }}
                onSave={handleSaveNode}
            />
        </div>
    );
};

// -- Helpers ----------------------------------------------------------------

interface GroupSpec {
    type: NodeType;
    kicker: string;
    label: string;
}
const TYPE_ORDER: GroupSpec[] = [
    { type: 'AGENT_IA', kicker: '1 · Créateur', label: 'Agents IA' },
    { type: 'SOFTWARE_MCP', kicker: '2 · Vérificateur', label: 'Logiciels MCP' },
    { type: 'HUMAN', kicker: '3 · Garant', label: 'Humains' },
];

function groupByType(nodes: HybridNode[]) {
    return TYPE_ORDER.map(({ type, kicker, label }) => ({
        kicker,
        label,
        nodes: nodes.filter((n) => n.type === type),
    }));
}

function topoSort(nodes: HybridNode[], startId: string): HybridNode[] {
    const out: HybridNode[] = [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const walk = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        const node = byId.get(id);
        if (!node) return;
        out.push(node);
        nodes.filter((n) => n.parentID === id).forEach((child) => walk(child.id));
    };
    walk(startId);
    return out;
}

function NodeGroup({
    kicker,
    label,
    nodes,
    onOpen,
    onRun,
    onEdit,
    onValidate,
    onDelete,
    deletableIds,
    pendingCount,
}: {
    kicker: string;
    label: string;
    nodes: HybridNode[];
    onOpen: (n: HybridNode) => void;
    /** Absents quand le rôle ne permet pas l'action — la commande n'est pas rendue. */
    onRun?: (n: HybridNode) => void;
    onEdit?: (n: HybridNode) => void;
    onValidate?: (n: HybridNode) => void;
    onDelete?: (n: HybridNode) => void;
    /** Identifiants des nœuds réellement supprimables (les autres n'ont pas le bouton). */
    deletableIds?: Set<string>;
    pendingCount: number;
}) {
    return (
        <div className="flex w-full flex-col items-center">
            <span className="kicker-quiet mb-1">{kicker}</span>
            <span className="mb-3 text-xs font-semibold text-slate-500">{label}</span>
            <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-10">
                {nodes.map((n) => (
                    <HybridNodeCard
                        key={n.id}
                        node={n}
                        pendingValidations={
                            n.type === 'HUMAN' && n.status === 'WAITING_HUMAN_APPROVAL'
                                ? pendingCount
                                : 0
                        }
                        onRun={onRun && n.type === 'AGENT_IA' ? () => onRun(n) : undefined}
                        onEdit={onEdit ? () => onEdit(n) : undefined}
                        isEditMode={Boolean(onDelete && deletableIds?.has(n.id))}
                        onDelete={
                            onDelete && deletableIds?.has(n.id) ? () => onDelete(n) : undefined
                        }
                        onValidate={onValidate && n.type === 'HUMAN' ? () => onValidate(n) : undefined}
                        onOpen={() => onOpen(n)}
                    />
                ))}
            </div>
            {nodes.length > 1 && (
                <div className="mt-2">
                    <ConnectorSVG
                        childrenCount={nodes.length}
                        childStatuses={nodes.map((n) => n.status)}
                    />
                </div>
            )}
        </div>
    );
}

function EmptyState({ onCreate, canCreate }: { onCreate: () => void; canCreate: boolean }) {
    return (
        <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-4 text-center">
            <div
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--bg-secondary)',
                    color: 'var(--fg-3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    lineHeight: 1,
                }}
                aria-hidden
            >
                +
            </div>
            <h2 className="t-h3" style={{ maxWidth: 460 }}>
                Aucun nœud dans la chaîne.
            </h2>
            <p className="t-body-quiet" style={{ maxWidth: 460 }}>
                Crée un agent IA, un logiciel MCP, ou importe ton CSV d'agents depuis Paramètres
                pour commencer à orchestrer.
            </p>
            <div className="mt-2">
                <Button tone="blue" onClick={onCreate} disabled={!canCreate}>
                    Créer le premier nœud
                </Button>
            </div>
        </div>
    );
}
