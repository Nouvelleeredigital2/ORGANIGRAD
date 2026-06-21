import { describe, it, expect } from 'vitest';
import { SecretCipher } from '../src/security/crypto.js';
import {
    encryptText,
    decryptText,
    encryptJson,
    decryptJson,
    isEncryptedEnvelope,
} from '../src/security/nodeSecrets.js';

function makeCipher(): SecretCipher {
    // Clé 32 octets (base64) dédiée aux tests — jamais en production.
    return SecretCipher.fromBase64Key('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
}

describe('nodeSecrets — chiffrement des champs texte', () => {
    it('encryptText/decryptText round-trip', () => {
        const cipher = makeCipher();
        const plain = 'Tu es un agent IA expert en droit.';
        const enc = encryptText(cipher, plain);
        expect(enc).toBeTruthy();
        expect(enc).not.toBe(plain);
        expect(decryptText(cipher, enc)).toBe(plain);
    });

    it('encryptText null → null', () => {
        const cipher = makeCipher();
        expect(encryptText(cipher, null)).toBeNull();
        expect(encryptText(cipher, undefined)).toBeNull();
    });

    it('decryptText sur valeur non chiffrée → retourne en clair (rétro-compatible)', () => {
        expect(decryptText(makeCipher(), 'plain text')).toBe('plain text');
    });

    it('sans cipher → pas de chiffrement', () => {
        const v = 'mon prompt';
        expect(encryptText(null, v)).toBe(v);
        expect(decryptText(null, v)).toBe(v);
    });
});

describe('nodeSecrets — chiffrement JSON (mcp_config / notification_channels)', () => {
    it('encryptJson/decryptJson round-trip', () => {
        const cipher = makeCipher();
        const obj = { serverUrl: 'https://mcp.example.com', connectedTo: ['n1'] };
        const enc = encryptJson(cipher, obj);
        expect(isEncryptedEnvelope(enc)).toBe(true);
        expect(decryptJson(cipher, enc)).toEqual(obj);
    });

    it('encryptJson null → null', () => {
        expect(encryptJson(makeCipher(), null)).toBeNull();
        expect(decryptJson(makeCipher(), null)).toBeNull();
    });

    it('decryptJson sur objet non enveloppé (rétro-compat)', () => {
        const obj = { serverUrl: 'https://x.com', connectedTo: [] };
        expect(decryptJson(makeCipher(), obj)).toEqual(obj);
    });

    it("sans cipher → pas d'enveloppe", () => {
        const obj = { serverUrl: 'https://x.com', connectedTo: [] };
        const enc = encryptJson(null, obj);
        expect(isEncryptedEnvelope(enc)).toBe(false);
        expect(enc).toEqual(obj);
    });
});
