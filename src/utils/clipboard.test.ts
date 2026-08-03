import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

/**
 * Risque couvert : une clé API n'est affichée qu'une seule fois. Si la copie
 * échoue en silence, la valeur est perdue définitivement. `copyToClipboard` ne
 * doit donc jamais lever, et doit toujours dire si la copie a abouti.
 */

const setClipboard = (impl: { writeText: (t: string) => Promise<void> } | undefined) => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: impl,
        configurable: true,
        writable: true,
    });
};

afterEach(() => {
    setClipboard(undefined);
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'execCommand');
});

describe('copyToClipboard', () => {
    it('signale le succès quand l’API presse-papiers accepte', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard({ writeText });

        await expect(copyToClipboard('secret')).resolves.toEqual({ ok: true });
        expect(writeText).toHaveBeenCalledWith('secret');
    });

    it('bascule sur le repli execCommand quand l’API est refusée', async () => {
        setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
        const execCommand = vi.fn().mockReturnValue(true);
        Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

        await expect(copyToClipboard('secret')).resolves.toEqual({ ok: true });
        expect(execCommand).toHaveBeenCalledWith('copy');
        // Le textarea temporaire ne doit pas rester dans le document.
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('renvoie un échec explicite sans lever quand tout échoue', async () => {
        setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('refus')) });
        Object.defineProperty(document, 'execCommand', {
            value: vi.fn().mockReturnValue(false),
            configurable: true,
        });

        const result = await copyToClipboard('secret');
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
        expect(document.querySelector('textarea')).toBeNull();
    });
});
