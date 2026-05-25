import { useMemo } from 'react';
import { Lock, AlertCircle, Play, Mail, Trash2, Pencil, ChevronUp, ChevronDown } from 'lucide-react';
import type { HybridNode } from '../types/hybridNode';
import { ARCHETYPE, STATUS, TONE_CLASSES } from '../design/tokens';
import { Button, IconButton, Pill, cx } from '../design/ui';

/**
 * HybridNodeCard — carte universelle des 3 archétypes.
 *
 * Refonte Apple-style :
 *   - Surface blanche, hairline 8% noir, ombre quasi-nulle
 *   - Aucun fond saturé par archétype : la différenciation se fait par GLYPH
 *     (disque / aperture / chiclet)
 *   - Une seule couleur d'accent (bleu Apple) pour l'IA, le focus, les liens
 *   - Aucune emoji — icônes Lucide (Lock, AlertCircle) pour les statuts
 *   - Surnames en MAJUSCULES (convention administrative française)
 */

export interface HybridNodeCardProps {
    node: HybridNode;
    pendingValidations?: number;
    onRun?: (node: HybridNode) => void;
    onValidate?: (node: HybridNode) => void;
    onOpen?: (node: HybridNode) => void;
    onContact?: (node: HybridNode) => void;
    onDelete?: (node: HybridNode) => void;
    onEdit?: (node: HybridNode) => void;
    hasChildren?: boolean;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    isHighlighted?: boolean;
    totalInBranch?: number;
    isEditMode?: boolean;
    className?: string;
}

// --- Glyphes CSS (la signature visuelle) -----------------------------------

function ArchetypeGlyph({ glyph }: { glyph: 'disc' | 'aperture' | 'chiclet' }) {
    if (glyph === 'disc') {
        // Humain — disque chaud sur cercle sand wash
        return (
            <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--human-fill)' }}
                aria-hidden
            >
                <div
                    className="h-5 w-5 rounded-full"
                    style={{ background: 'var(--human-ink)' }}
                />
            </div>
        );
    }
    if (glyph === 'aperture') {
        // IA — anneau creux + pip central (la seule occurrence du bleu)
        return (
            <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--ai-fill)' }}
                aria-hidden
            >
                <div
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ boxShadow: 'inset 0 0 0 1.5px var(--ai-ink)' }}
                >
                    <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: 'var(--ai-ink)' }}
                    />
                </div>
            </div>
        );
    }
    // Logiciel MCP — chiclet carré silver wash
    return (
        <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'var(--software-fill)' }}
            aria-hidden
        >
            <div
                className="h-5 w-5 rounded-[5px]"
                style={{ background: 'var(--software-ink)' }}
            />
        </div>
    );
}

function StatusBadge({ status }: { status: HybridNodeCardProps['node']['status'] }) {
    const s = STATUS[status];
    const tone = TONE_CLASSES[s.tone];
    return (
        <span
            className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
                tone.soft,
                tone.text,
                tone.ring,
            )}
        >
            <span className="relative flex h-1.5 w-1.5">
                {s.pulse && (
                    <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                        style={{ background: s.svg }}
                    />
                )}
                <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: s.svg }}
                />
            </span>
            {s.icon === 'lock' && <Lock size={11} strokeWidth={1.8} />}
            {s.icon === 'alert' && <AlertCircle size={11} strokeWidth={1.8} />}
            {s.label}
        </span>
    );
}

// --- Composant principal ---------------------------------------------------

export default function HybridNodeCard({
    node,
    pendingValidations = 0,
    onRun,
    onValidate,
    onOpen,
    onContact,
    onDelete,
    onEdit,
    hasChildren = false,
    isExpanded = false,
    onToggleExpand,
    isHighlighted = false,
    totalInBranch,
    isEditMode = false,
    className = '',
}: HybridNodeCardProps) {
    const archetype = ARCHETYPE[node.type];
    const isLocked = node.status === 'WAITING_HUMAN_APPROVAL';

    const skills = useMemo(() => node.skills?.slice(0, 4) ?? [], [node.skills]);
    const extraSkills = (node.skills?.length ?? 0) - skills.length;

    // Surnames en MAJUSCULES pour les humains (convention française)
    const displayName = useMemo(() => {
        if (node.type !== 'HUMAN') return node.nom;
        const parts = node.nom.trim().split(/\s+/);
        if (parts.length < 2) return node.nom;
        const last = parts[parts.length - 1];
        const first = parts.slice(0, -1).join(' ');
        return (
            <>
                {first} <span className="uppercase tracking-[-0.005em]">{last}</span>
            </>
        );
    }, [node.nom, node.type]);

    return (
        <article
            data-node-id={node.id}
            onClick={() => onOpen?.(node)}
            className={cx(
                'group relative w-full max-w-xs sm:w-72 cursor-pointer select-none p-5 transition-all duration-300',
                'bg-white rounded-[28px]',
                'shadow-[inset_0_0_0_1px_var(--hairline),0_1px_2px_rgba(0,0,0,0.04)]',
                'hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_var(--hairline-strong),0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_-10px_rgba(0,0,0,0.08)]',
                isLocked && 'shadow-[inset_0_0_0_1.5px_var(--system-yellow),0_1px_2px_rgba(0,0,0,0.04)]',
                isHighlighted && 'shadow-[0_0_0_4px_rgba(0,113,227,0.2),inset_0_0_0_1px_var(--hairline)]',
                className,
            )}
        >
            <header className="flex items-start gap-3">
                {node.type === 'HUMAN' && node.avatarUrl ? (
                    <img
                        src={node.avatarUrl}
                        alt={node.nom}
                        className="h-12 w-12 rounded-full object-cover"
                    />
                ) : (
                    <ArchetypeGlyph glyph={archetype.glyph} />
                )}

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span
                            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                            style={{ color: 'var(--fg-4)' }}
                        >
                            {archetype.label}
                        </span>
                        {node.type === 'HUMAN' && pendingValidations > 0 && (
                            <span
                                className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white"
                                style={{ background: 'var(--system-red)' }}
                                title={`${pendingValidations} validation(s) en attente`}
                            >
                                {pendingValidations > 99 ? '99+' : pendingValidations}
                            </span>
                        )}
                    </div>
                    <h3
                        className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.012em]"
                        style={{ color: 'var(--fg-1)' }}
                    >
                        {displayName}
                    </h3>
                    <p
                        className="truncate text-[13px] font-medium tracking-[-0.005em]"
                        style={{ color: 'var(--fg-3)' }}
                    >
                        {node.roleTitre}
                    </p>
                </div>
            </header>

            <div className="mt-4">
                <StatusBadge status={node.status} />
            </div>

            {node.type === 'AGENT_IA' && node.systemPrompt && (
                <div
                    className="mt-3 max-h-16 overflow-hidden rounded-[10px] p-2.5 text-[12px] leading-snug"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--fg-2)' }}
                >
                    <span className="font-semibold" style={{ color: 'var(--fg-1)' }}>
                        Prompt ·{' '}
                    </span>
                    <span className="line-clamp-2">{node.systemPrompt}</span>
                </div>
            )}

            {node.type === 'SOFTWARE_MCP' && node.mcpConfig && (
                <div
                    className="mt-3 rounded-[10px] p-2.5 text-[12px]"
                    style={{ background: 'var(--bg-secondary)' }}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold" style={{ color: 'var(--fg-1)' }}>
                            MCP
                        </span>
                        <span
                            className="truncate font-mono text-[11px]"
                            style={{ color: 'var(--fg-3)' }}
                            title={node.mcpConfig.serverUrl}
                        >
                            {node.mcpConfig.serverUrl}
                        </span>
                    </div>
                    {node.mcpConfig.connectedTo.length > 0 && (
                        <div className="mt-0.5" style={{ color: 'var(--fg-4)' }}>
                            {node.mcpConfig.connectedTo.length} connexion(s)
                        </div>
                    )}
                </div>
            )}

            {skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {skills.map((skill) => (
                        <Pill key={skill} tone="slate">
                            {skill}
                        </Pill>
                    ))}
                    {extraSkills > 0 && <Pill tone="slate">+{extraSkills}</Pill>}
                </div>
            )}

            <footer className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px]" style={{ color: 'var(--fg-4)' }}>
                        #{node.id.slice(0, 8)}
                    </span>
                    {typeof totalInBranch === 'number' && totalInBranch > 1 && (
                        <Pill tone="slate" title={`${totalInBranch} nœuds dans cette branche`}>
                            {totalInBranch}
                        </Pill>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    {node.type === 'HUMAN' && onContact && (
                        <IconButton
                            tone="blue"
                            label="Contact"
                            onClick={(e) => {
                                e.stopPropagation();
                                onContact(node);
                            }}
                        >
                            <Mail size={13} strokeWidth={1.6} />
                        </IconButton>
                    )}

                    {onEdit && (
                        <IconButton
                            tone="slate"
                            label="Éditer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(node);
                            }}
                        >
                            <Pencil size={13} strokeWidth={1.6} />
                        </IconButton>
                    )}

                    {isEditMode && onDelete && (
                        <IconButton
                            tone="red"
                            label="Supprimer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(node);
                            }}
                        >
                            <Trash2 size={13} strokeWidth={1.6} />
                        </IconButton>
                    )}

                    {node.type === 'AGENT_IA' && !isLocked && onRun && (
                        <Button
                            tone="blue"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRun(node);
                            }}
                        >
                            <Play size={11} strokeWidth={1.8} /> Run
                        </Button>
                    )}

                    {isLocked && node.type === 'HUMAN' && onValidate && (
                        <Button
                            tone="yellow"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onValidate(node);
                            }}
                        >
                            <Lock size={11} strokeWidth={1.8} /> Valider
                        </Button>
                    )}

                    {hasChildren && onToggleExpand && (
                        <IconButton
                            tone="slate"
                            label={isExpanded ? 'Replier' : 'Déplier'}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpand();
                            }}
                        >
                            {isExpanded ? (
                                <ChevronUp size={13} strokeWidth={1.6} />
                            ) : (
                                <ChevronDown size={13} strokeWidth={1.6} />
                            )}
                        </IconButton>
                    )}
                </div>
            </footer>
        </article>
    );
}
