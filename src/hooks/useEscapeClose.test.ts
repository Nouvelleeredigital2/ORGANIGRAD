import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeClose } from './useEscapeClose';

describe('useEscapeClose', () => {
    it('appelle onClose quand on appuie sur Échap', () => {
        const onClose = vi.fn();
        renderHook(() => useEscapeClose(true, onClose));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('ignore les autres touches', () => {
        const onClose = vi.fn();
        renderHook(() => useEscapeClose(true, onClose));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('ne fait rien si isOpen=false', () => {
        const onClose = vi.fn();
        renderHook(() => useEscapeClose(false, onClose));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(onClose).not.toHaveBeenCalled();
    });
});
