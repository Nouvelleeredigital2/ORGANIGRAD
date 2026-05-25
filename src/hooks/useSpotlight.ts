import { useState, useEffect, useCallback } from 'react';

interface SpotlightProps {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
}

export const useSpotlight = (): SpotlightProps => {
    const [isOpen, setIsOpen] = useState(false);

    const onOpen = useCallback(() => setIsOpen(true), []);
    const onClose = useCallback(() => setIsOpen(false), []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+K or Ctrl+K to open
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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
    }, []);

    // Scroll lock when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }, [isOpen]);

    return {
        isOpen,
        onOpen,
        onClose
    };
};
