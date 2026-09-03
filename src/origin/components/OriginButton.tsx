import React from 'react';

/**
 * Bouton Origin — la forme signature de la marque.
 *
 * Pourquoi ce composant existe : l'application comptait **75 `<button>`**
 * écrits à la main dans 27 fichiers, sans primitive partagée. Trois d'entre eux
 * seulement portaient `.origin-button`, et un quatrième portait
 * `origin-button-primary` — une classe **qui n'est définie nulle part**, donc
 * sans effet : ce bouton avait perdu le coin de tension en silence. C'est le
 * genre de dérive qu'aucun test ne rattrape et qu'un composant partagé rend
 * impossible.
 *
 * Deux écarts assumés par rapport au `Button.jsx` du kit UI :
 *
 *  1. **La forme.** Le kit pose `borderRadius: 9999` (une gélule), ce qui
 *     contredit sa propre règle de marque — « the Origin tension-corner button
 *     shape (12px 12px 3px 12px) is part of the brand ». On garde donc
 *     `.origin-button`, qui compose cette forme depuis les variables Origin.
 *  2. **Les attributs natifs.** Le kit n'expose que `onClick`/`disabled` et
 *     laisse tomber `type`, qui vaut alors `submit` : dans un formulaire, un
 *     bouton d'action en soumettrait l'ensemble. On étend
 *     `ButtonHTMLAttributes` et on force `type="button"` par défaut, ce qui
 *     préserve au passage `title`, `aria-*` et `form`.
 *
 * L'API de variantes et de tailles, elle, vient bien du kit : elle est saine et
 * couvre les cas rencontrés dans l'application.
 */

export type OriginButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type OriginButtonSize = 'md' | 'sm';

export interface OriginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: OriginButtonVariant;
    size?: OriginButtonSize;
}

/** Habillage par variante. Les couleurs viennent des tokens, jamais en dur. */
const VARIANT_STYLE: Record<OriginButtonVariant, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#ffffff' },
    secondary: { background: 'var(--bg-secondary)', color: 'var(--fg-1)' },
    ghost: { background: 'transparent', color: 'var(--accent)' },
    // Bordure intérieure plutôt qu'un fond plein : l'action destructrice se
    // signale sans crier, conformément à la retenue du système.
    destructive: {
        background: 'transparent',
        color: 'var(--system-red)',
        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--system-red) 25%, transparent)',
    },
};

const SIZE_CLASS: Record<OriginButtonSize, string> = {
    md: 'gap-2 px-5 py-2.5 text-sm',
    sm: 'gap-1.5 px-3.5 py-1.5 text-[13px]',
};

export const OriginButton: React.FC<OriginButtonProps> = ({
    variant = 'primary',
    size = 'md',
    type = 'button',
    className = '',
    style,
    children,
    ...rest
}) => {
    return (
        <button
            type={type}
            className={`origin-button origin-motion ${SIZE_CLASS[size]} disabled:cursor-default disabled:opacity-50 ${className}`}
            style={{ ...VARIANT_STYLE[variant], ...style }}
            {...rest}
        >
            {children}
        </button>
    );
};
