import { SecretCipher, isEncrypted } from './crypto.js';

/**
 * Chiffrement au repos des champs sensibles d'un nœud (Phase 5 / audit #1).
 *
 * Les secrets d'intégration (`systemPrompt`, `mcpConfig`, `notificationChannels`)
 * sont chiffrés AVANT stockage par l'orchestrateur (seul rédacteur via le chemin
 * serveur) et déchiffrés à la lecture côté orchestrateur. La base ne contient que
 * du chiffré ; le client (lecture directe Supabase) ne voit que des enveloppes.
 *
 * Rétro-compatible : si `cipher` est null (clé non configurée), tout reste en
 * clair — aucun changement de comportement.
 */

const ENC_KEY = '_enc';
type Envelope = { [ENC_KEY]: string };

function isEnvelope(v: unknown): v is Envelope {
    return (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>)[ENC_KEY] === 'string'
    );
}

/** Chiffre un texte (no-op si cipher null ou valeur vide). */
export function encryptText(cipher: SecretCipher | null, v: string | null | undefined): string | null {
    if (v == null || v === '') return v ?? null;
    return cipher ? cipher.encrypt(v) : v;
}

/** Déchiffre un texte (no-op si non chiffré ou cipher null). */
export function decryptText(cipher: SecretCipher | null, v: string | null | undefined): string | null {
    if (v == null) return null;
    return cipher && isEncrypted(v) ? cipher.decrypt(v) : v;
}

/** Chiffre un objet JSON dans une enveloppe `{_enc}` (no-op si cipher null). */
export function encryptJson(cipher: SecretCipher | null, obj: unknown): unknown {
    if (obj == null) return null;
    if (!cipher) return obj;
    return { [ENC_KEY]: cipher.encrypt(JSON.stringify(obj)) };
}

/** Déchiffre une enveloppe JSON (no-op si non enveloppée ou cipher null). */
export function decryptJson<T>(cipher: SecretCipher | null, stored: unknown): T | null {
    if (stored == null) return null;
    if (cipher && isEnvelope(stored)) {
        return JSON.parse(cipher.decrypt(stored[ENC_KEY])) as T;
    }
    return stored as T;
}

/** Indique si une valeur jsonb stockée est une enveloppe chiffrée. */
export function isEncryptedEnvelope(v: unknown): boolean {
    return isEnvelope(v);
}
