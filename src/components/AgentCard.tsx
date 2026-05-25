import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Agent } from '../types/agent';
import { User, ChevronRight, Trash2, UserCircle, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface AgentCardProps {
    agent: Agent;
    isExpanded?: boolean;
    hasChildren?: boolean;
    onToggleExpand?: () => void;
    isHighlighted?: boolean;
    totalInBranch?: number;
    onDelete?: () => void;
    onProfileClick?: (agent: Agent) => void;
    onContactClick?: (agent: Agent) => void;
    isEditMode?: boolean;
    showServiceLabel?: boolean;
}

export const AgentCard: React.FC<AgentCardProps> = ({
    agent,
    isExpanded = true,
    hasChildren = false,
    onToggleExpand,
    isHighlighted = false,
    totalInBranch,
    onDelete,
    onProfileClick,
    onContactClick,
    isEditMode = false,
    showServiceLabel = true,
}) => {
    const isDirection = agent.gradeStyle === 'Direction';
    const isExpert = agent.gradeStyle === 'Expert';
    const isManager = agent.gradeStyle === 'Responsable';
    const isVacant = !agent.nom && !agent.prenom;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                'group relative flex cursor-default flex-col items-center rounded-[2rem] border backdrop-blur-xl transition-all duration-500',
                isVacant ? 'border-2 border-dashed border-slate-300 bg-slate-50/72 shadow-none' : 'border-white/80 bg-white/84 shadow-[0_22px_60px_rgba(148,163,184,0.16)]',
                isHighlighted ? 'border-sky-300 ring-4 ring-sky-400/15 shadow-[0_28px_70px_rgba(125,211,252,0.28)]' : '',
                !isVacant && 'hover:-translate-y-1.5 hover:shadow-[0_28px_70px_rgba(148,163,184,0.2)]',
                isDirection ? 'w-80 p-8' : 'w-72 p-6'
            )}
        >
            {!isVacant && (
                <div
                    className={cn(
                        'absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/90 px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_12px_28px_rgba(148,163,184,0.16)]',
                        isDirection ? 'bg-amber-100 text-amber-700' :
                            isManager || isExpert ? 'bg-slate-100 text-slate-600' :
                                'bg-slate-50 text-slate-400'
                    )}
                >
                    {agent.gradeStyle === 'Responsable' ? 'Responsable' : agent.gradeStyle}
                </div>
            )}

            {isEditMode && onDelete && !isVacant && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Supprimer ${agent.prenom} ${agent.nom} ?`)) {
                            onDelete();
                        }
                    }}
                    className="absolute left-4 top-4 z-30 rounded-lg bg-red-50 p-2 text-red-500 opacity-0 shadow-sm transition-all hover:bg-red-100 group-hover:opacity-100 print:hidden"
                    title="Supprimer l'agent"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            )}

            {totalInBranch !== undefined && totalInBranch > 1 && !isVacant && (
                <div className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-[10px] font-black text-white shadow-[0_10px_24px_rgba(14,165,233,0.3)]">
                    {totalInBranch}
                </div>
            )}

            <div className="mb-4 flex w-full flex-col items-center">
                <div
                    className={cn(
                        'mb-4 overflow-hidden rounded-full ring-4 ring-white shadow-[0_18px_38px_rgba(148,163,184,0.18)] transition-transform duration-500',
                        !isVacant && 'group-hover:scale-105',
                        isDirection ? 'h-24 w-24' : 'h-16 w-16',
                        isVacant && 'border-2 border-dashed border-slate-200 bg-slate-100 shadow-none'
                    )}
                >
                    {agent.avatarUrl ? (
                        <img src={agent.avatarUrl} alt={`${agent.prenom} ${agent.nom}`} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300">
                            <User className={isDirection ? 'h-12 w-12' : 'h-8 w-8'} />
                        </div>
                    )}
                </div>

                <h3
                    className={cn(
                        'mb-1 text-center leading-none tracking-tighter text-slate-900',
                        isDirection ? 'text-xl font-black' : 'text-lg font-bold',
                        isVacant && 'italic text-slate-400'
                    )}
                >
                    {isVacant ? 'Poste a pourvoir' : (
                        <>
                            {agent.prenom} <span className="uppercase">{agent.nom}</span>
                        </>
                    )}
                </h3>

                <p
                    className={cn(
                        'text-center text-sm uppercase tracking-tighter',
                        isVacant ? 'font-medium text-slate-300' : 'font-bold text-sky-700'
                    )}
                >
                    {agent.fonction}
                </p>

                {showServiceLabel && agent.service && !isVacant && (
                    <p className="mt-1 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {agent.service}
                    </p>
                )}
            </div>

            {!isVacant && (
                <div className="mt-6 flex w-full translate-y-2 justify-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <button
                        onClick={() => onProfileClick?.(agent)}
                        className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    >
                        <UserCircle className="h-3.5 w-3.5 text-sky-500" />
                        Profil
                    </button>
                    <button
                        onClick={() => onContactClick?.(agent)}
                        className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    >
                        <Mail className="h-3.5 w-3.5 text-sky-500" />
                        Contact
                    </button>
                </div>
            )}

            {hasChildren && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand?.();
                    }}
                    className="absolute -bottom-4 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-white/80 bg-white text-slate-400 shadow-[0_16px_32px_rgba(148,163,184,0.18)] transition-all hover:border-sky-200 hover:text-sky-600 print:hidden"
                >
                    <ChevronRight className={cn('h-5 w-5 transition-transform duration-500', isExpanded ? 'rotate-90' : 'rotate-0')} />
                </button>
            )}
        </motion.div>
    );
};
