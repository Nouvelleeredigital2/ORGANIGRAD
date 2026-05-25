import { useEffect } from 'react';

/**
 * Ferme un overlay quand l'utilisateur appuie sur Échap.
 * Le listener n'est branché que si `isOpen` est vrai.
 */
export function useEscapeClose(isOpen: boolean, onClose: () => void): void {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);
}
