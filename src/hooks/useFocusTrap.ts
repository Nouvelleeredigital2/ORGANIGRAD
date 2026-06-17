import { useEffect, useRef } from 'react';

/**
 * Piège le focus clavier à l'intérieur d'un conteneur (modale) tant que `active`
 * est vrai (Priorité 11) :
 *   - mémorise l'élément focalisé à l'ouverture et le restaure à la fermeture ;
 *   - déplace le focus sur le premier élément focalisable du conteneur ;
 *   - boucle Tab / Shift+Tab à l'intérieur du conteneur.
 *
 * Renvoie une ref à attacher au conteneur de la modale.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
    const containerRef = useRef<T | null>(null);

    useEffect(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;

        const focusableSelector =
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

        const getFocusable = (): HTMLElement[] =>
            Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
                (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
            );

        // Focus initial sur le premier élément focalisable (ou le conteneur).
        const focusables = getFocusable();
        (focusables[0] ?? container).focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const items = getFocusable();
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const first = items[0]!;
            const last = items[items.length - 1]!;
            const activeEl = document.activeElement;
            if (e.shiftKey && activeEl === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && activeEl === last) {
                e.preventDefault();
                first.focus();
            }
        };

        container.addEventListener('keydown', onKeyDown);
        return () => {
            container.removeEventListener('keydown', onKeyDown);
            // Restaure le focus à la fermeture.
            previouslyFocused?.focus?.();
        };
    }, [active]);

    return containerRef;
}
