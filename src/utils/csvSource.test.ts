import { describe, expect, it } from 'vitest';
import { resolveCsvSource } from './csvSource';

describe('resolveCsvSource', () => {
    it('uses the bundled sample when no url is configured', () => {
        expect(resolveCsvSource('')).toEqual({
            inputUrl: '',
            effectiveUrl: '/data.csv',
            isRemote: false,
            label: 'Jeu local embarqué',
            helperText: "Aucune URL distante configurée. L'application utilise le CSV local intégré.",
        });
    });

    it('keeps a remote url when one is provided', () => {
        expect(resolveCsvSource('https://example.com/org.csv')).toEqual({
            inputUrl: 'https://example.com/org.csv',
            effectiveUrl: 'https://example.com/org.csv',
            isRemote: true,
            label: 'Source distante',
            helperText: "CSV distant configuré. La synchronisation utilise l'URL fournie.",
        });
    });
});
