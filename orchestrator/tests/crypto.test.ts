import { describe, it, expect } from 'vitest';
import {
    SecretCipher,
    EncryptionError,
    isEncrypted,
    generateKeyBase64,
} from '../src/security/crypto.js';

const cipher = SecretCipher.fromBase64Key(generateKeyBase64());

describe('SecretCipher (AES-256-GCM)', () => {
    it('round-trip chiffre puis déchiffre', () => {
        const secret = 'https://hooks.slack.com/services/T/B/secret';
        const enc = cipher.encrypt(secret);
        expect(isEncrypted(enc)).toBe(true);
        expect(enc).not.toContain('hooks.slack.com'); // le clair ne fuit pas
        expect(cipher.decrypt(enc)).toBe(secret);
    });

    it('deux chiffrements du même clair diffèrent (IV aléatoire)', () => {
        expect(cipher.encrypt('x')).not.toBe(cipher.encrypt('x'));
    });

    it('détecte l\'altération (tag GCM)', () => {
        const enc = cipher.encrypt('secret');
        const tampered = enc.slice(0, -2) + (enc.endsWith('A') ? 'B' : 'A');
        expect(() => cipher.decrypt(tampered)).toThrow(EncryptionError);
    });

    it('une autre clé ne peut pas déchiffrer', () => {
        const enc = cipher.encrypt('secret');
        const other = SecretCipher.fromBase64Key(generateKeyBase64());
        expect(() => other.decrypt(enc)).toThrow(EncryptionError);
    });

    it('refuse une clé de mauvaise longueur', () => {
        expect(() => SecretCipher.fromBase64Key(Buffer.from('short').toString('base64'))).toThrow(
            EncryptionError,
        );
    });

    it('fromEnv lève si la clé est absente', () => {
        expect(() => SecretCipher.fromEnv({})).toThrow(EncryptionError);
    });

    it('refuse un format non chiffré au déchiffrement', () => {
        expect(() => cipher.decrypt('texte en clair')).toThrow(EncryptionError);
    });
});
