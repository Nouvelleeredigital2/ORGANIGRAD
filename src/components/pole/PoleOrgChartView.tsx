import React from 'react';
import { Building2, Users } from 'lucide-react';
import type { Agent } from '../../types/agent';
import type { SelectedPoleState } from '../../hooks/useOrgChartController';
import { OrgChart, type OrgChartRef } from '../OrgChart';

interface PoleOrgChartViewProps {
    selectedPole: SelectedPoleState | null;
    orgChartRef: React.RefObject<OrgChartRef | null>;
    isPdfMode: boolean;
    isEditMode: boolean;
    onToggleEditMode: () => void;
    highlightedId: string | null;
    highlightedPath: Set<string>;
    onDeleteAgent: (id: string) => void;
    onProfileClick: (agent: Agent) => void;
    onContactClick: (agent: Agent) => void;
    useHybridCard?: boolean;
    onToggleHybridCard?: () => void;
}

export const PoleOrgChartView: React.FC<PoleOrgChartViewProps> = ({
    selectedPole,
    orgChartRef,
    isPdfMode,
    isEditMode,
    onToggleEditMode,
    highlightedId,
    highlightedPath,
    onDeleteAgent,
    onProfileClick,
    onContactClick,
    useHybridCard = false,
    onToggleHybridCard,
}) => {
    if (!selectedPole) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 px-10 py-12 text-center text-slate-500">
                    Selectionnez un pole dans la barre laterale pour afficher son organigramme.
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col">
            <div className="px-10 pb-6 pt-10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Organigramme</p>
                        <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-slate-900">{selectedPole.pole}</h2>
                        <div className="mt-5 flex flex-wrap items-center gap-3 text-slate-500">
                            <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/82 px-4 py-2 shadow-[0_12px_32px_rgba(148,163,184,0.12)]">
                                <Building2 className="h-4 w-4" />
                                <span className="text-sm font-bold">Pole complet</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/82 px-4 py-2 shadow-[0_12px_32px_rgba(148,163,184,0.12)]">
                                <Users className="h-4 w-4" />
                                <span className="text-sm font-bold">{selectedPole.agents.length} agents</span>
                            </div>
                            {onToggleHybridCard && (
                                <button
                                    type="button"
                                    onClick={onToggleHybridCard}
                                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-[0_12px_32px_rgba(148,163,184,0.12)] transition ${
                                        useHybridCard
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-white/80 bg-white/82 text-slate-500 hover:bg-white'
                                    }`}
                                    title="Bascule entre la carte RH legacy et la carte HybridNode"
                                >
                                    <span aria-hidden>{useHybridCard ? '⚡' : '👤'}</span>
                                    {useHybridCard ? 'Vue Hybride' : 'Vue RH'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="min-h-[780px] flex-1">
                <OrgChart
                    ref={orgChartRef}
                    data={selectedPole.tree}
                    isPdfMode={isPdfMode}
                    isEditMode={isEditMode}
                    onToggleEditMode={onToggleEditMode}
                    highlightedId={highlightedId}
                    highlightedPath={highlightedPath}
                    onDeleteAgent={onDeleteAgent}
                    onProfileClick={onProfileClick}
                    onContactClick={onContactClick}
                    useHybridCard={useHybridCard}
                />
            </div>
        </div>
    );
};
