import { useState, useEffect, useCallback } from 'react';

interface SpotlightProps {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
}

export interface UseSpotlightOptions {
    /**
     * Désactive UNIQUEMENT le raccourci clavier ⌘K/Ctrl+K (le clic sur le
     * déclencheur et Échap restent actifs). Sert à éviter le conflit avec le
     * Spotlight local d'une autre vue (Orchestration/HybridSpotlight) qui
     * possède son propre raccourci ⌘K : sans ce garde-fou, les DEUX
     * s'ouvraient simultanément — le Spotlight RH plein écran par-dessus le
     * Spotlight hybride qui venait de recevoir le focus. Audit P2.
     */
    disableShortcut?: boolean;
}

export const useSpotlight = (opts: UseSpotlightOptions = {}): SpotlightProps => {
    const { disableShortcut = false } = opts;
    const [isOpen, setIsOpen] = useState(false);

    const onOpen = useCallback(() => setIsOpen(true), []);
    const onClose = useCallback(() => setIsOpen(false), []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+K or Ctrl+K to open — comparaison insensible à la casse
            // (Verr. Maj rend `e.key === 'K'`, pas `'k'`).
            if (!disableShortcut && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }

            // Escape to close
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [disableShortcut]);

    // Scroll lock when open — le nettoyage à la fermeture OU au démontage
    // (composant retiré pendant que le panneau était ouvert) manquait : le
    // scroll de la page restait bloqué pour toujours. Audit P3.
    useEffect(() => {
        if (!isOpen) return undefined;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    return {
        isOpen,
        onOpen,
        onClose
    };
};
