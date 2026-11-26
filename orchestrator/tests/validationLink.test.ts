import { describe, it, expect } from 'vitest';
import { buildValidationLink } from '../src/lib/validationLink.js';

describe('buildValidationLink', () => {
    it('produit le format lu par la SPA (v + node)', () => {
        expect(buildValidationLink('https://organigrad.app', 'n1')).toBe(
            'https://organigrad.app/?v=orchestration&node=n1',
        );
    });

    it('conserve le chemin et les paramètres déjà présents dans APP_URL', () => {
        const url = new URL(buildValidationLink('https://x.fr/app/?ref=mail', 'n1'));
        const params = url.searchParams;
        expect(url.pathname).toBe('/app/');
        expect(params.get('ref')).toBe('mail');
        expect(params.get('v')).toBe('orchestration');
        expect(params.get('node')).toBe('n1');
    });

    it('encode un identifiant de nœud arbitraire', () => {
        const link = buildValidationLink('https://organigrad.app', 'a&b=c d');
        expect(new URL(link).searchParams.get('node')).toBe('a&b=c d');
    });

    it('reste dans le bon format si APP_URL n\'est pas une URL absolue', () => {
        expect(buildValidationLink('/relatif', 'a b')).toBe('/relatif?v=orchestration&node=a%20b');
    });
});
