import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpotlight } from './useSpotlight';

function pressCtrlK() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
}

afterEach(() => {
    document.body.style.overflow = '';
});

describe('useSpotlight', () => {
    it('Ctrl+K ouvre par défaut', () => {
        const { result } = renderHook(() => useSpotlight());
        act(() => pressCtrlK());
        expect(result.current.isOpen).toBe(true);
    });

    // Audit P2 : sans ce garde, le Spotlight RH s'ouvrait EN MÊME TEMPS que le
    // Spotlight local d'une autre vue (ex. HybridSpotlight en Orchestration)
    // sur le même raccourci ⌘K.
    it('disableShortcut désactive Ctrl+K, sans affecter onOpen (clic)', () => {
        const { result } = renderHook(() => useSpotlight({ disableShortcut: true }));
        act(() => pressCtrlK());
        expect(result.current.isOpen).toBe(false);

        act(() => result.current.onOpen());
        expect(result.current.isOpen).toBe(true);
    });

    it('Échap ferme même quand le raccourci est désactivé', () => {
        const { result } = renderHook(() => useSpotlight({ disableShortcut: true }));
        act(() => result.current.onOpen());
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
        expect(result.current.isOpen).toBe(false);
    });

    // Audit P3 : le verrou de scroll posé à l'ouverture n'était jamais retiré
    // si le composant démontait pendant que le panneau était ouvert.
    it('retire le verrou de scroll au démontage pendant que le panneau est ouvert', () => {
        const { result, unmount } = renderHook(() => useSpotlight());
        act(() => result.current.onOpen());
        expect(document.body.style.overflow).toBe('hidden');
        unmount();
        expect(document.body.style.overflow).toBe('');
    });
});
