import React from 'react';
import { TONE_CLASSES, STATUS, SURFACE, RADIUS, MOTION, FOCUS, TEXT } from './tokens';
import type { Tone } from './tokens';
import type { NodeStatus } from '../types/hybridNode';
import { cx } from './cx';

/**
 * Primitives UI Organigrad — chaque composant tire ses styles des tokens.
 * Aucune classe utilitaire de couleur ne doit être hardcodée hors d'ici.
 *
 * `cx` est défini dans `./cx` (réexport ici interdit par react-refresh) — les
 * consommateurs externes doivent l'importer depuis `../design/cx`.
 */

// --- Button -----------------------------------------------------------------

type ButtonVariant = 'solid' | 'soft' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    tone?: Tone;
    variant?: ButtonVariant;
    size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ tone = 'slate', variant = 'solid', size = 'md', type = 'button', className, children, ...props }, ref) => {
        const t = TONE_CLASSES[tone];
        const base = cx(
            'inline-flex items-center justify-center gap-2 font-semibold active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
            MOTION.base,
            FOCUS.ring,
            RADIUS.button,
            size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-4 py-2 text-sm',
        );
        const styles =
            variant === 'solid'
                ? cx(t.solid, t.solidHover, 'text-white shadow-sm')
                : variant === 'soft'
                  ? cx(t.soft, t.softHover, t.text, 'ring-1', t.ring)
                  : variant === 'outline'
                    ? cx('bg-white', t.text, 'ring-1', t.ring, t.softHover)
                    : cx(t.text, t.softHover);
        return (
            <button ref={ref} type={type} className={cx(base, styles, className)} {...props}>
                {children}
            </button>
        );
    },
);
Button.displayName = 'Button';

// --- Pill -------------------------------------------------------------------

interface PillProps {
    tone?: Tone;
    variant?: 'soft' | 'solid';
    children: React.ReactNode;
    className?: string;
    title?: string;
}

export function Pill({ tone = 'slate', variant = 'soft', children, className, title }: PillProps) {
    const t = TONE_CLASSES[tone];
    const styles =
        variant === 'solid'
            ? cx(t.solid, 'text-white')
            : cx(t.soft, t.text, 'ring-1', t.ring);
    return (
        <span
            title={title}
            className={cx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                styles,
                className,
            )}
        >
            {children}
        </span>
    );
}

// --- StatusDot --------------------------------------------------------------

interface StatusDotProps {
    status: NodeStatus;
    /** Affiche le label texte à côté du dot */
    withLabel?: boolean;
}

export function StatusDot({ status, withLabel }: StatusDotProps) {
    const s = STATUS[status];
    const t = TONE_CLASSES[s.tone];
    const dotColor = cx(t.solid);

    return (
        <span className={cx('inline-flex items-center gap-1.5')}>
            <span className="relative flex h-2 w-2">
                {s.pulse && (
                    <span
                        className={cx(
                            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                            dotColor,
                        )}
                    />
                )}
                <span className={cx('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
            </span>
            {withLabel && (
                <span
                    className={cx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
                        t.soft,
                        t.text,
                        t.ring,
                    )}
                >
                    {s.icon && <span aria-hidden>{s.icon}</span>}
                    {s.label}
                </span>
            )}
        </span>
    );
}

// --- Surface ----------------------------------------------------------------

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'card' | 'modal';
    children?: React.ReactNode;
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
    ({ variant = 'card', className, children, ...props }, ref) => (
        <div
            ref={ref}
            className={cx(variant === 'card' ? SURFACE.card : SURFACE.modal, className)}
            {...props}
        >
            {children}
        </div>
    ),
);
Surface.displayName = 'Surface';

// --- IconButton -------------------------------------------------------------

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    tone?: Tone;
    label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ tone = 'slate', label, className, children, ...props }, ref) => {
        const t = TONE_CLASSES[tone];
        return (
            <button
                ref={ref}
                type="button"
                aria-label={label}
                title={label}
                className={cx(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 transition',
                    t.soft,
                    t.softHover,
                    t.text,
                    t.ring,
                    className,
                )}
                {...props}
            >
                {children}
            </button>
        );
    },
);
IconButton.displayName = 'IconButton';

// --- Form primitives --------------------------------------------------------

const FIELD_BASE = cx(
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900',
    'placeholder:text-slate-400',
    MOTION.fast,
    FOCUS.ring,
    'focus:border-slate-400',
    'disabled:opacity-50 disabled:bg-slate-50',
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, invalid, ...props }, ref) => (
        <input
            ref={ref}
            aria-invalid={invalid || undefined}
            className={cx(FIELD_BASE, invalid && 'border-rose-300', className)}
            {...props}
        />
    ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className, ...props }, ref) => (
        <textarea ref={ref} className={cx(FIELD_BASE, 'resize-y min-h-[72px]', className)} {...props} />
    ),
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
    ({ className, children, ...props }, ref) => (
        <select ref={ref} className={cx(FIELD_BASE, 'pr-8', className)} {...props}>
            {children}
        </select>
    ),
);
Select.displayName = 'Select';

interface FormFieldProps {
    label: string;
    hint?: string;
    error?: string;
    children: React.ReactNode;
    className?: string;
}

export function FormField({ label, hint, error, children, className }: FormFieldProps) {
    // Le contrôle est imbriqué DANS le <label> → association implicite (a11y),
    // sans avoir à câbler un id sur chaque champ.
    return (
        <label className={cx('block', className)}>
            <span className={cx('mb-1 block text-slate-400', TEXT.kicker)}>{label}</span>
            {children}
            {error ? (
                <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>
            ) : hint ? (
                <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
            ) : null}
        </label>
    );
}

// --- Kbd primitive ----------------------------------------------------------

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <kbd
            className={cx(
                'rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 shadow-[0_1px_0_rgba(0,0,0,0.04)]',
                className,
            )}
        >
            {children}
        </kbd>
    );
}
