import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Loader2, Printer, Users, Settings, Layers3, Workflow, Menu, X, LogOut, ChevronDown, Key, UsersRound } from 'lucide-react';
import type { AppView } from '../../hooks/useOrgChartController';
import type { CsvSourceInfo } from '../../utils/csvSource';
import type { PoleDirectoryEntry } from '../../utils/poleDirectory';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { supabase } from '../../lib/supabase';

/**
 * Sidebar — Apple-style refinement.
 * 260px, fond off-white (page bg), hairline 1px à droite. Pas de glass.
 */

interface SidebarProps {
    activeView: AppView;
    setActiveView: (view: AppView) => void;
    loading: boolean;
    handleBatchExport: () => void;
    isExporting: boolean;
    sourceInfo: CsvSourceInfo;
    poleDirectory: PoleDirectoryEntry[];
    selectedPoleKey: string | null;
    setSelectedPoleKey: (key: string) => void;
    batchExportLabel: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
    activeView,
    setActiveView,
    loading,
    handleBatchExport,
    isExporting,
    sourceInfo,
    poleDirectory,
    selectedPoleKey,
    setSelectedPoleKey,
    batchExportLabel,
}) => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
    const ws = useWorkspaceContext();

    useEffect(() => {
        setMobileOpen(false);
    }, [activeView, selectedPoleKey]);

    useEffect(() => {
        if (!mobileOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mobileOpen]);

    return (
        <>
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Ouvrir le menu"
                className="fixed left-3 top-3 z-[100000] inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--fg-1)] backdrop-blur lg:hidden print:hidden"
                style={{
                    background: 'var(--surface-tint)',
                    boxShadow: 'inset 0 0 0 1px var(--hairline), 0 1px 2px rgba(0,0,0,0.04)',
                }}
            >
                <Menu className="h-5 w-5" strokeWidth={1.6} />
            </button>

            {mobileOpen && (
                <div
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-[rgba(29,29,31,0.32)] backdrop-blur-sm lg:hidden print:hidden"
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-40 w-[260px] max-w-[85vw] flex-col print:hidden transition-transform duration-300 lg:static lg:translate-x-0 lg:visible lg:pointer-events-auto flex',
                    mobileOpen
                        ? 'translate-x-0 visible pointer-events-auto'
                        : '-translate-x-full invisible pointer-events-none lg:visible lg:pointer-events-auto',
                )}
                style={{
                    background: 'var(--bg-page)',
                    boxShadow: 'inset -1px 0 0 var(--hairline)',
                }}
            >
                <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    aria-label="Fermer le menu"
                    className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--fg-3)] hover:bg-[var(--bg-secondary)] lg:hidden"
                >
                    <X className="h-4 w-4" strokeWidth={1.6} />
                </button>

                {/* Brand + workspace switcher */}
                <div className="px-5 pt-6 pb-2">
                    <button
                        type="button"
                        onClick={() => setWsDropdownOpen((v) => !v)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-1 py-1 text-left transition hover:bg-[var(--bg-secondary)]"
                    >
                        <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] font-display text-[17px] font-semibold text-white"
                            style={{
                                background: 'var(--ink-1)',
                                letterSpacing: '-0.06em',
                                fontFamily: 'var(--font-display)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                            }}
                        >
                            O
                        </div>
                        <div className="flex-1 min-w-0">
                            <div
                                className="truncate text-[15px] font-semibold leading-tight"
                                style={{ color: 'var(--fg-1)', letterSpacing: '-0.018em' }}
                            >
                                {ws.activeWorkspace?.name ?? 'Organigrad'}
                            </div>
                            <div
                                className="text-[11px]"
                                style={{ color: 'var(--fg-4)', letterSpacing: '0.02em' }}
                            >
                                {ws.activeWorkspace?.role
                                    ? ws.activeWorkspace.role
                                    : 'Orchestration hybride'}
                            </div>
                        </div>
                        <ChevronDown size={14} strokeWidth={1.6} style={{ color: 'var(--fg-4)' }} />
                    </button>

                    {wsDropdownOpen && (
                        <div
                            className="mt-2 overflow-hidden rounded-[10px]"
                            style={{ background: 'var(--bg-secondary)' }}
                        >
                            <p
                                className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase"
                                style={{ color: 'var(--fg-4)', letterSpacing: '0.14em' }}
                            >
                                Workspaces
                            </p>
                            {ws.workspaces.map((w) => (
                                <button
                                    key={w.id}
                                    onClick={() => {
                                        ws.setActive(w.id);
                                        setWsDropdownOpen(false);
                                    }}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition hover:bg-white"
                                    style={{
                                        color:
                                            w.id === ws.activeId ? 'var(--fg-1)' : 'var(--fg-2)',
                                        fontWeight: w.id === ws.activeId ? 600 : 400,
                                    }}
                                >
                                    <span className="truncate">{w.name}</span>
                                    <span
                                        className="font-mono text-[10px]"
                                        style={{ color: 'var(--fg-4)' }}
                                    >
                                        {w.role}
                                    </span>
                                </button>
                            ))}
                            <div className="my-1 h-px" style={{ background: 'var(--hairline)' }} />
                            <button
                                onClick={() => supabase?.auth.signOut()}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-white"
                                style={{ color: 'var(--system-red)' }}
                            >
                                <LogOut size={13} strokeWidth={1.6} />
                                Se déconnecter
                            </button>
                        </div>
                    )}
                </div>

                {/* Group label */}
                <p
                    className="px-5 pt-5 pb-1.5 text-[11px] font-semibold uppercase"
                    style={{ color: 'var(--fg-4)', letterSpacing: '0.14em' }}
                >
                    Navigation
                </p>

                <nav className="flex flex-col gap-px px-3">
                    <NavItem icon={<Users size={17} strokeWidth={1.6} />} label="Organigrammes" active={activeView === 'orgchart'} onClick={() => setActiveView('orgchart')} />
                    <NavItem icon={<LayoutDashboard size={17} strokeWidth={1.6} />} label="Tableau de bord" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
                    <NavItem icon={<Workflow size={17} strokeWidth={1.6} />} label="Orchestration" active={activeView === 'orchestration'} onClick={() => setActiveView('orchestration')} />
                    <NavItem icon={<UsersRound size={17} strokeWidth={1.6} />} label="Membres" active={activeView === 'members'} onClick={() => setActiveView('members')} />
                    <NavItem icon={<Key size={17} strokeWidth={1.6} />} label="Clés API" active={activeView === 'api-keys'} onClick={() => setActiveView('api-keys')} />
                    <NavItem icon={<Settings size={17} strokeWidth={1.6} />} label="Paramètres" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />

                    <div className="my-2 mx-3 h-px" style={{ background: 'var(--hairline)' }} />

                    <button
                        onClick={handleBatchExport}
                        disabled={isExporting || loading || poleDirectory.length === 0}
                        className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[14px] font-medium transition disabled:opacity-50"
                        style={{ color: 'var(--accent)' }}
                    >
                        {isExporting ? (
                            <Loader2 size={17} strokeWidth={1.6} className="animate-spin" />
                        ) : (
                            <Printer size={17} strokeWidth={1.6} />
                        )}
                        <span className="leading-tight">{batchExportLabel}</span>
                    </button>
                </nav>

                {/* Source info */}
                <div
                    className="mx-4 mt-4 rounded-[14px] px-4 py-3"
                    style={{ background: 'var(--bg-secondary)' }}
                >
                    <p
                        className="mb-1 text-[11px] font-semibold uppercase"
                        style={{ color: 'var(--fg-4)', letterSpacing: '0.12em' }}
                    >
                        Source
                    </p>
                    <p className="text-[13px] font-medium" style={{ color: 'var(--fg-1)' }}>
                        {sourceInfo.label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--fg-3)' }}>
                        {sourceInfo.helperText}
                    </p>
                </div>

                {/* Poles */}
                <div className="flex flex-1 min-h-0 flex-col px-3 pt-4 pb-4">
                    <div className="mb-2 flex items-center gap-2 px-2">
                        <Layers3 size={13} strokeWidth={1.6} style={{ color: 'var(--fg-4)' }} />
                        <p
                            className="text-[11px] font-semibold uppercase"
                            style={{ color: 'var(--fg-4)', letterSpacing: '0.14em' }}
                        >
                            Pôles
                        </p>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {poleDirectory.length === 0 ? (
                            <div
                                className="rounded-[10px] border border-dashed px-3 py-4 text-[12px]"
                                style={{
                                    borderColor: 'var(--hairline-strong)',
                                    color: 'var(--fg-3)',
                                }}
                            >
                                Aucun pôle disponible pour le moment.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-px">
                                {poleDirectory.map((pole) => (
                                    <button
                                        key={pole.key}
                                        onClick={() => {
                                            setSelectedPoleKey(pole.key);
                                            setActiveView('orgchart');
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left transition',
                                            selectedPoleKey === pole.key
                                                ? 'bg-[var(--bg-secondary)]'
                                                : 'hover:bg-[rgba(0,0,0,0.04)]',
                                        )}
                                        style={{
                                            color:
                                                selectedPoleKey === pole.key ? 'var(--fg-1)' : 'var(--fg-2)',
                                        }}
                                    >
                                        <span className="text-[13px] font-medium leading-tight">{pole.pole}</span>
                                        <span
                                            className="font-mono text-[11px]"
                                            style={{
                                                color:
                                                    selectedPoleKey === pole.key ? 'var(--fg-2)' : 'var(--fg-4)',
                                            }}
                                        >
                                            {pole.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
};

function NavItem({
    icon,
    label,
    active,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[14px] font-medium transition',
                active ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[rgba(0,0,0,0.04)]',
            )}
            style={{ color: active ? 'var(--fg-1)' : 'var(--fg-2)' }}
        >
            <span style={{ opacity: 0.85 }}>{icon}</span>
            {label}
        </button>
    );
}

function cn(...inputs: (string | boolean | undefined | null)[]) {
    return inputs.filter(Boolean).join(' ');
}
