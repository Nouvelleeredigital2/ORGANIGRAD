import { useEffect, useState } from 'react';
import { onActivity, type ActivityEvent } from '../services/activityBus';
import { NOTIFICATION_EVENT, type NotificationEventDetail } from '../services/notificationService';
import { transitionsRepo, type TransitionRecord } from '../services/transitionsRepo';
import { useWorkspaceContext } from '../contexts/WorkspaceContext';
import { Surface, Pill, cx } from '../design/ui';
import { STATUS } from '../design/tokens';
import type { HybridNode, NodeStatus } from '../types/hybridNode';
import { hybridNodeRepo } from '../services/hybridNodeRepo';

/**
 * Journal d'activité — flux temps réel mixte :
 *   - Bus local `activityBus` (événements UI : create, edit, delete, run client)
 *   - Supabase Realtime sur `node_transitions` (transitions persistées par
 *     l'orchestrateur ou par d'autres onglets / membres du workspace)
 *   - Notifications HITL via CustomEvent
 *
 * En mode connecté (workspace + Supabase OK), les transitions distantes
 * arrivent en live sur tous les onglets ouverts.
 */

const KIND_META: Record<
    ActivityEvent['kind'],
    { icon: string; tone: 'slate' | 'emerald' | 'blue' | 'rose' | 'amber' }
> = {
    transition: { icon: '↺', tone: 'slate' },
    run: { icon: '⚡', tone: 'emerald' },
    create: { icon: '＋', tone: 'blue' },
    edit: { icon: '✎', tone: 'slate' },
    delete: { icon: '×', tone: 'rose' },
    notify: { icon: '🔔', tone: 'amber' },
};

interface DisplayEvent extends ActivityEvent {
    source?: 'local' | 'realtime';
}

export function ActivityLog() {
    const { activeId: workspaceId } = useWorkspaceContext();
    const [events, setEvents] = useState<DisplayEvent[]>([]);
    const [nodeNameById, setNodeNameById] = useState<Map<string, string>>(new Map());

    // Map de résolution `node_id` → nom — alimentée par le repo
    useEffect(() => {
        if (!workspaceId) return;
        void hybridNodeRepo.list({ workspaceId }).then((nodes) => {
            setNodeNameById(new Map(nodes.map((n) => [n.id, n.nom])));
        });
        const off = hybridNodeRepo.subscribe({ workspaceId }, (event, node) => {
            if (event === 'DELETE') {
                setNodeNameById((prev) => {
                    const next = new Map(prev);
                    next.delete(node.id);
                    return next;
                });
            } else {
                const full = node as HybridNode;
                setNodeNameById((prev) => new Map(prev).set(full.id, full.nom));
            }
        });
        return off;
    }, [workspaceId]);

    // Bus local + notifs
    useEffect(() => {
        const off1 = onActivity((e) => {
            setEvents((prev) => [{ ...e, source: 'local' as const }, ...prev].slice(0, 30));
        });
        const handleNotif = (e: Event) => {
            const detail = (e as CustomEvent<NotificationEventDetail>).detail;
            setEvents((prev) =>
                [
                    {
                        id: `notif-${detail.timestamp}`,
                        kind: 'notify',
                        nodeId: detail.node.id,
                        nodeName: detail.node.nom,
                        message: `${detail.message} · ${detail.channels.map((c) => c.key).join(', ') || 'aucun canal'}`,
                        timestamp: detail.timestamp,
                        source: 'local',
                    } as DisplayEvent,
                    ...prev,
                ].slice(0, 30),
            );
        };
        window.addEventListener(NOTIFICATION_EVENT, handleNotif);
        return () => {
            off1();
            window.removeEventListener(NOTIFICATION_EVENT, handleNotif);
        };
    }, []);

    // Supabase Realtime sur node_transitions
    useEffect(() => {
        if (!workspaceId) return;

        let cancelled = false;
        // Snapshot initial : les 30 dernières transitions persistées
        void transitionsRepo.listRecent(workspaceId, 30).then((rows) => {
            if (cancelled) return;
            setEvents((prev) => {
                const fromRealtime = rows.map((r) => recordToEvent(r, nodeNameById));
                // Merge sans doublons (par id)
                const seen = new Set(prev.map((e) => e.id));
                const merged = [...prev, ...fromRealtime.filter((e) => !seen.has(e.id))];
                return merged
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 30);
            });
        });

        const off = transitionsRepo.subscribe(workspaceId, (rec) => {
            setEvents((prev) => {
                if (prev.some((e) => e.id === rec.id)) return prev;
                return [recordToEvent(rec, nodeNameById), ...prev].slice(0, 30);
            });
        });

        return () => {
            cancelled = true;
            off();
        };
    }, [workspaceId, nodeNameById]);

    const isRealtimeOn = Boolean(workspaceId);

    return (
        <Surface variant="card" className="flex h-full flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-400">
                        Journal d'activité
                    </p>
                    {isRealtimeOn && (
                        <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest"
                            style={{
                                background: 'rgba(52,199,89,0.1)',
                                color: 'var(--system-green)',
                                letterSpacing: '0.14em',
                            }}
                            title="Synchronisé Realtime sur ce workspace"
                        >
                            <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ background: 'var(--system-green)' }}
                            />
                            Live
                        </span>
                    )}
                </div>
                {events.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setEvents([])}
                        className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
                    >
                        Effacer
                    </button>
                )}
            </div>
            {events.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                    Aucun événement pour l'instant.
                    <br />
                    Lance la chaîne pour voir les transitions.
                </div>
            ) : (
                <ul className="flex-1 space-y-1.5 overflow-y-auto">
                    {events.map((e) => (
                        <ActivityItem key={e.id} event={e} />
                    ))}
                </ul>
            )}
        </Surface>
    );
}

function ActivityItem({ event }: { event: DisplayEvent }) {
    const meta = KIND_META[event.kind];
    return (
        <li
            className={cx(
                'flex items-start gap-2 rounded-lg border border-slate-100 bg-white/70 p-2.5 text-xs',
            )}
        >
            <span
                aria-hidden
                className={cx('mt-0.5 text-sm leading-none')}
                style={{ color: event.to ? STATUS[event.to].svg : undefined }}
            >
                {meta.icon}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-slate-800">{event.nodeName}</span>
                    <span className="text-[10px] text-slate-400">
                        {new Date(event.timestamp).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                        })}
                    </span>
                </div>
                <p className="truncate text-slate-500">{event.message}</p>
                {event.to && (
                    <div className="mt-1 flex items-center gap-1.5">
                        <Pill tone={STATUS[event.to].tone}>{STATUS[event.to].label}</Pill>
                        {event.source === 'realtime' && (
                            <span
                                className="text-[9px] font-semibold uppercase"
                                style={{ color: 'var(--fg-4)', letterSpacing: '0.12em' }}
                            >
                                · distant
                            </span>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}

function recordToEvent(rec: TransitionRecord, names: Map<string, string>): DisplayEvent {
    const status: NodeStatus = rec.to;
    return {
        id: rec.id,
        kind: 'transition',
        nodeId: rec.nodeId,
        nodeName: names.get(rec.nodeId) ?? rec.nodeId.slice(0, 8),
        message: `${rec.from.replace(/_/g, ' ')} → ${rec.to.replace(/_/g, ' ')} · ${rec.actorKind}`,
        from: rec.from,
        to: status,
        timestamp: rec.timestamp,
        source: 'realtime',
    };
}
