import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HybridNodeCard from '../HybridNodeCard';
import { ConnectorSVG } from '../ConnectorSVG';
import { ValidationCenter, type ValidationItem } from '../ValidationCenter';
import { MCPAnchorsOverlay } from '../MCPAnchorsOverlay';
import { HybridSpotlight } from '../spotlight/HybridSpotlight';
import { NodeEditor } from '../NodeEditor';
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

interface OrchestrationViewProps {
    rawAgents: Agent[];
}

const CYCLE: NodeStatus[] = [
    'IDLE',
    'EXECUTING',
    'CONTROL_PENDING_IA',
    'WAITING_HUMAN_APPROVAL',
    'ERROR',
];
const cycleStatus = (s: NodeStatus): NodeStatus => CYCLE[(CYCLE.indexOf(s) + 1) % CYCLE.length]!;

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
    const [dataState, setDataState] = useState<'loading' | 'ready' | 'stale'>('loading');
    const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});

    // Pont vers l'orchestrateur backend (config dans Paramètres).
    // Quand `bridge.connected`, on délègue run/approve/reject au service distant
    // et on observe les statuts via SSE plutôt que de simuler localement.
    const bridge = useOrchestratorBridge();

    // Charge depuis Supabase quand on a un workspace + souscrit aux changements live
    useEffect(() => {
        let cancelled = false;
        // Cloisonnement : on repart IMMÉDIATEMENT du cache namespacé de CE
        // workspace (jamais celui d'un workspace précédent), puis on rafraîchit.
        setHybridSource(hybridNodeStore.list(workspaceId));
        setStatuses({});
        setDataState('loading');
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
    const stageRef = useRef<HTMLDivElement>(null);
    const spotlightRef = useRef<HTMLDivElement>(null);

    // Source de nœuds : merge { humains CSV } ∪ { nœuds hybrides Supabase }.
    // Statuts : ceux du bridge SSE quand connecté > statuts locaux > statut DB.
    const allNodes = useMemo<HybridNode[]>(() => {
        const humansFromCsv: HybridNode[] = rawAgents.map((a) => agentToHybridNode(a));
        const merged = [...humansFromCsv, ...hybridSource];
        const bridgeStatusById = bridge.connected
            ? new Map(bridge.nodes.map((n) => [n.id, n.status]))
            : null;
        return merged.map((n) => ({
            ...n,
            status: bridgeStatusById?.get(n.id) ?? statuses[n.id] ?? n.status,
        }));
    }, [hybridSource, rawAgents, statuses, bridge.connected, bridge.nodes]);

    const hasAnyNode = allNodes.length > 0;
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
                        when: 'à l\'instant',
                    };
                }),
        [allNodes],
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

    // Ping humain quand un nœud HUMAN passe en attente d'approbation
    useEffect(() => {
        pendingItems.forEach((item) => {
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
        setStatuses((prev) => {
            const from = prev[n.id] ?? n.status;
            if (from !== next) emitTransition(n, from, next);
            return { ...prev, [n.id]: next };
        });
    }, []);

    /**
     * Lance la chaîne :
     *   - Mode orchestrateur (bridge connecté) : POST /api/nodes/:root/run.
     *     Les transitions reviennent via SSE et alimentent `bridge.nodes`.
     *   - Mode local (offline / non connecté) : simulation chronométrée.
     */
    const runChain = () => {
        const roots = allNodes.filter((n) => !n.parentID);
        if (roots.length === 0) return;

        const first = roots[0]!;
        emitActivity({
            kind: 'run',
            nodeId: first.id,
            nodeName: first.nom,
            message: 'Démarrage de la chaîne',
        });

        setIsRunning(true);

        if (bridge.connected) {
            void bridge.runNode(first.id)
                .catch((err) => {
                    console.error('[OrchestrationView] runNode failed', err);
                })
                .finally(() => setIsRunning(false));
            return;
        }

        // --- Simulation locale (sans orchestrateur) ---
        setStatuses({});
        const order = topoSort(allNodes, first.id);
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
        (n: HybridNode) => {
            if (bridge.connected) {
                void bridge.approve(n.id).catch((err) =>
                    console.error('[OrchestrationView] approve failed', err),
                );
                return;
            }
            setStatusFor(n, 'IDLE');
        },
        [bridge, setStatusFor],
    );

    const rejectNode = useCallback(
        (n: HybridNode, feedback: string) => {
            if (bridge.connected) {
                void bridge.reject(n.id, feedback).catch((err) =>
                    console.error('[OrchestrationView] reject failed', err),
                );
                return;
            }
            setStatusFor(n, 'ERROR');
        },
        [bridge, setStatusFor],
    );

    const handleSaveNode = async (node: HybridNode) => {
        const exists = hybridSource.some((n) => n.id === node.id);
        try {
            const saved = await hybridNodeRepo.upsert(node, { workspaceId });
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
        } catch (err) {
            console.error('[OrchestrationView] save failed', err);
            setSaveError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
        } finally {
            setEditorOpen(false);
            setEditorNode(null);
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
                                background: bridge.connected
                                    ? 'var(--system-green)'
                                    : 'var(--ink-5)',
                            }}
                        />
                        <span style={{ color: 'var(--fg-3)' }}>
                            {bridge.connected
                                ? 'Orchestrateur connecté · transitions distribuées'
                                : 'Mode local · transitions simulées (configurer l\'orchestrateur dans Paramètres)'}
                        </span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <Button tone="blue" onClick={runChain} disabled={!hasAnyNode || isRunning}>
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
                            onClick={() => { setStatuses({}); setIsRunning(false); }}
                            disabled={!hasAnyNode}
                        >
                            Réinitialiser
                        </Button>
                        <Button
                            tone="slate"
                            variant="soft"
                            onClick={() => {
                                setEditorNode(null);
                                setEditorOpen(true);
                            }}
                        >
                            Nouveau nœud
                        </Button>
                    </div>
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
                    {!hasAnyNode ? (
                        <EmptyState onCreate={() => setEditorOpen(true)} />
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
                                            onOpen={(n) =>
                                                setStatusFor(n, cycleStatus(n.status))
                                            }
                                            onRun={(n) => {
                                                if (bridge.connected) {
                                                    void bridge.runNode(n.id);
                                                } else {
                                                    setStatusFor(n, 'EXECUTING');
                                                }
                                            }}
                                            onEdit={(n) => {
                                                setEditorNode(n);
                                                setEditorOpen(true);
                                            }}
                                            onValidate={() => setValidationOpen(true)}
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
                        Canaux : {toast.channels.map((c) => c.key).join(', ') || '—'}
                    </p>
                </div>
            )}

            <ValidationCenter
                isOpen={validationOpen}
                items={pendingItems}
                onClose={() => setValidationOpen(false)}
                onApprove={(node) => {
                    approveNode(node);
                    if (pendingItems.length <= 1) setValidationOpen(false);
                }}
                onReject={(node, feedback) => {
                    rejectNode(node, feedback);
                    if (pendingItems.length <= 1) setValidationOpen(false);
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
    pendingCount,
}: {
    kicker: string;
    label: string;
    nodes: HybridNode[];
    onOpen: (n: HybridNode) => void;
    onRun: (n: HybridNode) => void;
    onEdit: (n: HybridNode) => void;
    onValidate: (n: HybridNode) => void;
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
                        onRun={n.type === 'AGENT_IA' ? () => onRun(n) : undefined}
                        onEdit={() => onEdit(n)}
                        onValidate={n.type === 'HUMAN' ? () => onValidate(n) : undefined}
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

function EmptyState({ onCreate }: { onCreate: () => void }) {
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
                <Button tone="blue" onClick={onCreate}>
                    Créer le premier nœud
                </Button>
            </div>
        </div>
    );
}
