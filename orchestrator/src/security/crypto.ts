import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Chiffrement centralisé des secrets au repos (Phase 5).
 *
 * AES-256-GCM (authentifié). Le format stocké est `enc:v1:<base64(iv|tag|ct)>`,
 * versionné pour permettre une rotation d'algorithme. La clé (32 octets) provient
 * de l'environnement (`INTEGRATION_ENCRYPTION_KEY`, base64) et n'est JAMAIS
 * journalisée. Le déchiffrement échoue si le contenu a été altéré (tag GCM).
 *
 * Usage : chiffrer un secret d'intégration côté serveur avant stockage, ne le
 * déchiffrer qu'au moment de l'utilisation, et ne jamais le placer dans un DTO,
 * un log ou une erreur.
 */

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export class EncryptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EncryptionError';
    }
}

export function isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
}

/** Génère une clé AES-256 encodée base64 (pour provisionner l'environnement). */
export function generateKeyBase64(): string {
    return randomBytes(KEY_LEN).toString('base64');
}

export class SecretCipher {
    constructor(private readonly key: Buffer) {
        if (key.length !== KEY_LEN) {
            throw new EncryptionError(`Clé invalide : ${key.length} octets (attendu ${KEY_LEN}).`);
        }
    }

    static fromBase64Key(b64: string): SecretCipher {
        return new SecretCipher(Buffer.from(b64, 'base64'));
    }

    /** Construit depuis `INTEGRATION_ENCRYPTION_KEY` ; lève si absente/invalide. */
    static fromEnv(env: NodeJS.ProcessEnv = process.env): SecretCipher {
        const raw = env.INTEGRATION_ENCRYPTION_KEY?.trim();
        if (!raw) {
            throw new EncryptionError('INTEGRATION_ENCRYPTION_KEY manquante');
        }
        return SecretCipher.fromBase64Key(raw);
    }

    encrypt(plaintext: string): string {
        const iv = randomBytes(IV_LEN);
        const cipher = createCipheriv(ALGO, this.key, iv);
        const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
    }

    decrypt(encoded: string): string {
        if (!isEncrypted(encoded)) {
            throw new EncryptionError('format chiffré invalide');
        }
        const raw = Buffer.from(encoded.slice(PREFIX.length), 'base64');
        if (raw.length < IV_LEN + TAG_LEN) {
            throw new EncryptionError('contenu chiffré tronqué');
        }
        const iv = raw.subarray(0, IV_LEN);
        const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
        const ct = raw.subarray(IV_LEN + TAG_LEN);
        const decipher = createDecipheriv(ALGO, this.key, iv);
        decipher.setAuthTag(tag);
        try {
            return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
        } catch {
            // Tag GCM invalide → contenu altéré ou mauvaise clé.
            throw new EncryptionError('déchiffrement échoué (intégrité/clé)');
        }
    }
}
