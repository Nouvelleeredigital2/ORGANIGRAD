/**
 * Organigrad — Design Tokens (Apple-style refinement).
 *
 * Off-white pages · true-white surfaces · hairlines do the depth work ·
 * one accent (system blue) used sparingly · type carries the weight at LIGHT
 * weights (300-600 max, jamais 800/900).
 *
 * Les 3 archétypes (HUMAN / AGENT_IA / SOFTWARE_MCP) se différencient par
 * GLYPH SHAPE et FINISH, pas par fond de carte saturé :
 *   - HUMAN        → disque plein, sand wash, encre graphite
 *   - AGENT_IA     → anneau creux + pip, accent blue
 *   - SOFTWARE_MCP → chiclet carré, silver wash, encre cool graphite
 *
 * Les tokens CSS sont la source de vérité (src/styles/design-system.css).
 * Ce fichier ré-expose les classes Tailwind qui consomment les variables CSS.
 */
import type { NodeStatus, NodeType } from '../types/hybridNode';

export type Tone =
    | 'slate'
    | 'blue'
    | 'green'
    | 'orange'
    | 'yellow'
    | 'indigo'
    | 'red'
    | 'sky'
    // Alias legacy (mappés sur les system colors Apple-style) :
    | 'emerald'
    | 'amber'
    | 'violet'
    | 'rose';

// --- Tons (mappés sur les variables CSS Apple-style) ------------------------

type ToneValue = {
    solid: string;
    solidHover: string;
    soft: string;
    softHover: string;
    text: string;
    ring: string;
    border: string;
};

const BASE_TONES: Record<
    'slate' | 'blue' | 'green' | 'orange' | 'yellow' | 'indigo' | 'red' | 'sky',
    ToneValue
> = {
    slate: {
        solid: 'bg-[var(--ink-1)]',
        solidHover: 'hover:bg-[var(--ink-2)]',
        soft: 'bg-[var(--bg-secondary)]',
        softHover: 'hover:bg-[var(--bg-tertiary)]',
        text: 'text-[var(--fg-1)]',
        ring: 'ring-[var(--hairline)]',
        border: 'border-[var(--hairline)]',
    },
    blue: {
        solid: 'bg-[var(--accent)]',
        solidHover: 'hover:bg-[var(--accent-hover)]',
        soft: 'bg-[var(--accent-soft)]',
        softHover: 'hover:bg-[var(--accent-tint)]',
        text: 'text-[var(--accent)]',
        ring: 'ring-[var(--accent-soft)]',
        border: 'border-[var(--accent-soft)]',
    },
    green: {
        solid: 'bg-[var(--system-green)]',
        solidHover: 'hover:opacity-90',
        soft: 'bg-[rgba(52,199,89,0.1)]',
        softHover: 'hover:bg-[rgba(52,199,89,0.16)]',
        text: 'text-[var(--system-green)]',
        ring: 'ring-[rgba(52,199,89,0.2)]',
        border: 'border-[rgba(52,199,89,0.2)]',
    },
    yellow: {
        solid: 'bg-[var(--system-yellow)]',
        solidHover: 'hover:opacity-90',
        soft: 'bg-[rgba(255,159,10,0.1)]',
        softHover: 'hover:bg-[rgba(255,159,10,0.16)]',
        text: 'text-[var(--system-yellow)]',
        ring: 'ring-[rgba(255,159,10,0.25)]',
        border: 'border-[rgba(255,159,10,0.25)]',
    },
    indigo: {
        solid: 'bg-[var(--system-indigo)]',
        solidHover: 'hover:opacity-90',
        soft: 'bg-[rgba(88,86,214,0.1)]',
        softHover: 'hover:bg-[rgba(88,86,214,0.16)]',
        text: 'text-[var(--system-indigo)]',
        ring: 'ring-[rgba(88,86,214,0.2)]',
        border: 'border-[rgba(88,86,214,0.2)]',
    },
    red: {
        solid: 'bg-[var(--system-red)]',
        solidHover: 'hover:opacity-90',
        soft: 'bg-[rgba(255,59,48,0.06)]',
        softHover: 'hover:bg-[rgba(255,59,48,0.12)]',
        text: 'text-[var(--system-red)]',
        ring: 'ring-[rgba(255,59,48,0.25)]',
        border: 'border-[rgba(255,59,48,0.25)]',
    },
    orange: {
        solid: 'bg-[#86868b]',
        solidHover: 'hover:bg-[#6e6e73]',
        soft: 'bg-[var(--software-fill)]',
        softHover: 'hover:bg-[var(--bg-tertiary)]',
        text: 'text-[var(--software-ink)]',
        ring: 'ring-[var(--hairline)]',
        border: 'border-[var(--hairline)]',
    },
    sky: {
        solid: 'bg-[var(--accent)]',
        solidHover: 'hover:bg-[var(--accent-hover)]',
        soft: 'bg-[var(--accent-soft)]',
        softHover: 'hover:bg-[var(--accent-tint)]',
        text: 'text-[var(--accent)]',
        ring: 'ring-[var(--accent-soft)]',
        border: 'border-[var(--accent-soft)]',
    },
};

// Alias legacy → tons natifs (aucun cast, aucune mutation post-init)
export const TONE_CLASSES: Record<Tone, ToneValue> = {
    ...BASE_TONES,
    emerald: BASE_TONES.green,
    amber:   BASE_TONES.yellow,
    violet:  BASE_TONES.indigo,
    rose:    BASE_TONES.red,
};

// --- Archétypes (3 glyphes différenciants) ----------------------------------

export interface ArchetypeToken {
    tone: Tone;
    /** Affichage humain en français. */
    label: string;
    /** Glyph forme — 'disc' (Humain), 'aperture' (IA), 'chiclet' (Logiciel). */
    glyph: 'disc' | 'aperture' | 'chiclet';
}

export const ARCHETYPE: Record<NodeType, ArchetypeToken> = {
    HUMAN: { tone: 'slate', label: 'Humain', glyph: 'disc' },
    AGENT_IA: { tone: 'blue', label: 'Agent IA', glyph: 'aperture' },
    SOFTWARE_MCP: { tone: 'orange', label: 'Logiciel MCP', glyph: 'chiclet' },
};

// --- Statuts (system semantics, low-saturation) -----------------------------

export interface StatusToken {
    label: string;
    tone: Tone;
    svg: string;
    pulse: boolean;
    dasharray?: string;
    /** Icône Lucide à utiliser (jamais d'emoji). */
    icon?: 'lock' | 'alert';
}

export const STATUS: Record<NodeStatus, StatusToken> = {
    IDLE: {
        label: 'En repos',
        tone: 'slate',
        svg: 'var(--status-idle)',
        pulse: false,
    },
    EXECUTING: {
        label: 'En exécution',
        tone: 'green',
        svg: '#34c759',
        pulse: true,
    },
    CONTROL_PENDING_IA: {
        label: 'Contrôle IA',
        tone: 'indigo',
        svg: '#5856d6',
        pulse: true,
    },
    WAITING_HUMAN_APPROVAL: {
        label: 'Validation requise',
        tone: 'yellow',
        svg: '#ff9f0a',
        pulse: false,
        icon: 'lock',
    },
    ERROR: {
        label: 'Anomalie',
        tone: 'red',
        svg: '#ff3b30',
        pulse: false,
        dasharray: '3 3',
        icon: 'alert',
    },
};

// --- Surfaces ---------------------------------------------------------------

export const SHADOW = {
    hairline: 'shadow-[inset_0_0_0_1px_var(--hairline)]',
    flat: 'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
    card: 'shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_24px_-10px_rgba(0,0,0,0.08)]',
    raised: 'shadow-[0_4px_12px_rgba(0,0,0,0.06),0_16px_40px_-12px_rgba(0,0,0,0.12)]',
    floating: 'shadow-[0_24px_60px_-16px_rgba(0,0,0,0.22),0_8px_20px_rgba(0,0,0,0.08)]',
} as const;

export const RADIUS = {
    xs: 'rounded-[6px]',
    sm: 'rounded-[10px]',
    md: 'rounded-[14px]',
    lg: 'rounded-[18px]',
    xl: 'rounded-[22px]',
    '2xl': 'rounded-[28px]',
    '3xl': 'rounded-[34px]',
    pill: 'rounded-full',
    chip: 'rounded-full',
    button: 'rounded-full',
    card: 'rounded-[18px]',
    modal: 'rounded-[28px]',
} as const;

export const SURFACE = {
    card: `bg-white ${RADIUS.lg} ${SHADOW.hairline} ${SHADOW.flat}`,
    cardRaised: `bg-white ${RADIUS.lg} ${SHADOW.hairline} ${SHADOW.card}`,
    modal: `bg-white ${RADIUS.modal} ${SHADOW.floating}`,
    glass: `bg-[rgba(255,255,255,0.72)] backdrop-blur-[40px] backdrop-saturate-[180%] ${SHADOW.hairline} ${RADIUS.lg}`,
    chip: `${RADIUS.pill} ring-1`,
} as const;

// --- Typographie (utilitaires Tailwind exposant les classes CSS) ------------

export const TEXT = {
    /** Eyebrow / kicker — accent blue uppercase. */
    kicker: 'eyebrow',
    /** Eyebrow muted (graphite quaternaire). */
    kickerQuiet: 'eyebrow-quiet',
    hero: 't-hero',
    display: 't-display',
    h1: 't-h1',
    h2: 't-h2',
    h3: 't-h3',
    h4: 't-h4',
    body: 't-body',
    bodyMuted: 't-body-quiet',
    meta: 't-meta',
    caption: 't-caption',
    mono: 't-mono',
    number: 't-number',
} as const;

// --- Z-index ----------------------------------------------------------------

export const Z = {
    base: 'z-0',
    content: 'z-10',
    sticky: 'z-20',
    overlay: 'z-30',
    drawer: 'z-40',
    modal: 'z-50',
    toast: 'z-[60]',
} as const;

// --- Motion (3 durations, Apple emphatic spring) ----------------------------

export const MOTION = {
    fast: 'transition duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
    base: 'transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
    slow: 'transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
} as const;

// --- Focus ring -------------------------------------------------------------

export const FOCUS = {
    ring: 'focus:outline-none focus-visible:shadow-[0_0_0_4px_rgba(0,113,227,0.2)]',
} as const;
