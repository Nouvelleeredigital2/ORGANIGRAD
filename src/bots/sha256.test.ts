import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

describe('sha256Hex — vecteurs de test connus (FIPS 180-4)', () => {
    it('chaîne vide', () => {
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('"abc"', () => {
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('message de 56 caractères (franchit la limite d’un seul bloc de 64 octets)', () => {
        expect(
            sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
        ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    });

    it('texte UTF-8 multioctet — encode en UTF-8, pas en UTF-16', () => {
        // 'é' encode sur 2 octets UTF-8 (0xC3 0xA9), vecteur vérifié via node:crypto.
        expect(sha256Hex('é')).toBe('4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c');
    });
});
