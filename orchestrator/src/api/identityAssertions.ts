/**
 * Assertions d'identité signées (JWS compact EdDSA / Ed25519) échangées avec
 * le hub Synapse — recette « Atelier Boréal ».
 *
 *   - `verifyActorAssertion`  : le hub affirme à OrganiGrad QUI (linkUserId ↔
 *     organigradUserId) relaie une décision humaine via LINK. OrganiGrad ne
 *     fait confiance qu'à la signature du hub (clé publique ÉPINGLÉE) puis
 *     re-contrôle dans SA base que l'utilisateur a le droit de décider.
 *   - `signOrganigradAttestation` : OrganiGrad atteste au hub qu'une session
 *     humaine vérifiée (`req.userId`, jamais le corps) propose/confirme/révoque
 *     un lien d'identité.
 *
 * Sans dépendance externe : `node:crypto` (`sign`/`verify` avec `null` = Ed25519
 * pur). Aucune assertion n'est journalisée ici — les erreurs ne portent qu'un
 * code, jamais le jeton ni ses claims.
 */
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';

export type IdentityAssertionErrorCode =
    | 'MALFORMED'
    | 'UNSUPPORTED_HEADER'
    | 'UNKNOWN_KID'
    | 'BAD_SIGNATURE'
    | 'INVALID_CLAIMS'
    | 'NOT_YET_VALID'
    | 'EXPIRED'
    | 'BAD_LIFETIME'
    | 'BAD_KEY';

export class IdentityAssertionError extends Error {
    constructor(public readonly code: IdentityAssertionErrorCode) {
        super(`Assertion d'identité refusée : ${code}`);
        this.name = 'IdentityAssertionError';
    }
}

export const ACTOR_ASSERTION_TYP = 'synapse-identity-actor+jwt';
export const ORGANIGRAD_ATTESTATION_TYP = 'synapse-organigrad-identity+jwt';
/** Durée de vie maximale d'une assertion d'acteur (secondes). */
export const ACTOR_ASSERTION_MAX_LIFETIME_S = 60;
/** Tolérance d'horloge acceptée sur `issuedAt` (secondes). */
export const CLOCK_SKEW_S = 5;

const B64URL = /^[A-Za-z0-9_-]+$/;
const uuid = z.string().uuid();
const unixSeconds = z.number().int().nonnegative();

const headerSchema = z
    .object({ alg: z.literal('EdDSA'), typ: z.string().min(1), kid: z.string().min(1).max(128) })
    .strict();

const actorClaimsSchema = z
    .object({
        version: z.literal('1.0'),
        issuerApp: z.literal('synapse-hub'),
        audienceApp: z.literal('organigrad'),
        linkId: uuid,
        linkUserId: uuid,
        organigradUserId: uuid,
        project: z
            .object({
                sourceApp: z.literal('organigrad'),
                workspaceId: uuid,
                projectId: uuid,
                canonicalUrl: z.string().url().max(2048),
            })
            .strict(),
        requestId: uuid,
        issuedAt: unixSeconds,
        expiresAt: unixSeconds,
    })
    .strict();

export type ActorAssertionClaims = z.infer<typeof actorClaimsSchema>;

const attestationBase = {
    version: z.literal('1.0'),
    issuerApp: z.literal('organigrad'),
    audienceApp: z.literal('synapse-hub'),
    organigradUserId: uuid,
    workspaceId: uuid,
    requestId: uuid,
    issuedAt: unixSeconds,
    expiresAt: unixSeconds,
};

const attestationClaimsSchema = z.discriminatedUnion('purpose', [
    z.object({ ...attestationBase, purpose: z.literal('identity-link-propose'), linkUserId: uuid }).strict(),
    z.object({ ...attestationBase, purpose: z.literal('identity-link-confirm'), linkId: uuid }).strict(),
    z.object({ ...attestationBase, purpose: z.literal('identity-link-revoke'), linkId: uuid, reason: z.string().min(1).max(1000) }).strict(),
]);

export type OrganigradAttestationClaims = z.infer<typeof attestationClaimsSchema>;
export type OrganigradAttestationPurpose = OrganigradAttestationClaims['purpose'];

/** Durée de vie d'une attestation OrganiGrad selon son objet (secondes). */
export function attestationLifetimeSeconds(purpose: OrganigradAttestationPurpose): number {
    return purpose === 'identity-link-propose' ? 300 : 60;
}

function b64url(input: string | Buffer): string {
    return Buffer.from(input).toString('base64url');
}

function decodeJsonPart(part: string): unknown {
    if (!B64URL.test(part)) throw new IdentityAssertionError('MALFORMED');
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    } catch {
        throw new IdentityAssertionError('MALFORMED');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new IdentityAssertionError('MALFORMED');
    return parsed;
}

function ed25519PublicKey(pem: string): KeyObject {
    // `createPublicKey` accepte aussi un PEM PRIVÉ (il en dérive la publique) :
    // un fichier de clés épinglées ne doit jamais porter de clé privée.
    if (typeof pem !== 'string' || !pem.includes('-----BEGIN PUBLIC KEY-----')) throw new IdentityAssertionError('BAD_KEY');
    let key: KeyObject;
    try {
        key = createPublicKey(pem);
    } catch {
        throw new IdentityAssertionError('BAD_KEY');
    }
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new IdentityAssertionError('BAD_KEY');
    return key;
}

function ed25519PrivateKey(pem: string): KeyObject {
    if (typeof pem !== 'string' || !pem.includes('-----BEGIN PRIVATE KEY-----')) throw new IdentityAssertionError('BAD_KEY');
    let key: KeyObject;
    try {
        key = createPrivateKey(pem);
    } catch {
        throw new IdentityAssertionError('BAD_KEY');
    }
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') throw new IdentityAssertionError('BAD_KEY');
    return key;
}

/** Valide un jeu de clés publiques épinglées `{kid: pem}` (toutes Ed25519). */
export function assertPinnedPublicKeys(keys: Record<string, string>): void {
    const entries = Object.entries(keys);
    if (entries.length === 0) throw new IdentityAssertionError('BAD_KEY');
    for (const [kid, pem] of entries) {
        if (!kid || kid.length > 128 || typeof pem !== 'string') throw new IdentityAssertionError('BAD_KEY');
        ed25519PublicKey(pem);
    }
}

/** Valide qu'un PEM PKCS8 porte bien une clé privée Ed25519. */
export function assertSigningPrivateKey(pem: string): void {
    ed25519PrivateKey(pem);
}

export interface VerifiedJws {
    header: z.infer<typeof headerSchema>;
    payload: Record<string, unknown>;
}

/**
 * Vérifie la forme, l'en-tête (alg EdDSA, kid connu) et la signature d'un JWS
 * compact. Ne valide PAS les claims — voir `verifyActorAssertion`.
 */
export function verifyCompactEdDsaJws(jws: unknown, publicKeys: Record<string, string>): VerifiedJws {
    if (typeof jws !== 'string' || jws.length === 0 || jws.length > 8192) throw new IdentityAssertionError('MALFORMED');
    const parts = jws.split('.');
    if (parts.length !== 3) throw new IdentityAssertionError('MALFORMED');
    const [h, p, s] = parts as [string, string, string];
    if (!B64URL.test(s)) throw new IdentityAssertionError('MALFORMED');

    const headerRaw = decodeJsonPart(h);
    const headerParsed = headerSchema.safeParse(headerRaw);
    if (!headerParsed.success) throw new IdentityAssertionError('UNSUPPORTED_HEADER');
    const header = headerParsed.data;

    if (!Object.prototype.hasOwnProperty.call(publicKeys, header.kid)) throw new IdentityAssertionError('UNKNOWN_KID');
    const key = ed25519PublicKey(publicKeys[header.kid] as string);

    const signature = Buffer.from(s, 'base64url');
    if (signature.length !== 64) throw new IdentityAssertionError('BAD_SIGNATURE');
    let ok = false;
    try {
        ok = verify(null, Buffer.from(`${h}.${p}`), key, signature);
    } catch {
        ok = false;
    }
    if (!ok) throw new IdentityAssertionError('BAD_SIGNATURE');

    const payload = decodeJsonPart(p) as Record<string, unknown>;
    return { header, payload };
}

export interface VerifyActorAssertionOptions {
    /** Clés publiques épinglées du hub `{kid: pem}`. */
    hubPublicKeys: Record<string, string>;
    /** Horloge en secondes Unix (injectable pour les tests). */
    now?: number;
}

/**
 * Vérifie une assertion d'acteur émise par le hub Synapse et renvoie ses
 * claims. Lève `IdentityAssertionError` — jamais les claims ni le jeton.
 */
export function verifyActorAssertion(jws: unknown, opts: VerifyActorAssertionOptions): ActorAssertionClaims {
    const { header, payload } = verifyCompactEdDsaJws(jws, opts.hubPublicKeys);
    if (header.typ !== ACTOR_ASSERTION_TYP) throw new IdentityAssertionError('UNSUPPORTED_HEADER');

    const parsed = actorClaimsSchema.safeParse(payload);
    if (!parsed.success) throw new IdentityAssertionError('INVALID_CLAIMS');
    const claims = parsed.data;

    const lifetime = claims.expiresAt - claims.issuedAt;
    if (lifetime < 1 || lifetime > ACTOR_ASSERTION_MAX_LIFETIME_S) throw new IdentityAssertionError('BAD_LIFETIME');
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (claims.issuedAt > now + CLOCK_SKEW_S) throw new IdentityAssertionError('NOT_YET_VALID');
    if (claims.expiresAt <= now) throw new IdentityAssertionError('EXPIRED');
    return claims;
}

export interface SignAttestationOptions {
    kid: string;
    /** PEM PKCS8 d'une clé privée Ed25519. */
    privateKeyPem: string;
}

/**
 * Signe une attestation OrganiGrad → hub. Les claims sont validés strictement
 * AVANT signature (un claim en trop ou manquant lève `INVALID_CLAIMS`).
 */
export function signOrganigradAttestation(claims: OrganigradAttestationClaims, opts: SignAttestationOptions): string {
    const parsed = attestationClaimsSchema.safeParse(claims);
    if (!parsed.success) throw new IdentityAssertionError('INVALID_CLAIMS');
    const expected = attestationLifetimeSeconds(parsed.data.purpose);
    if (parsed.data.expiresAt - parsed.data.issuedAt !== expected) throw new IdentityAssertionError('BAD_LIFETIME');
    if (!opts.kid || opts.kid.length > 128) throw new IdentityAssertionError('BAD_KEY');
    const key = ed25519PrivateKey(opts.privateKeyPem);

    const header = b64url(JSON.stringify({ alg: 'EdDSA', typ: ORGANIGRAD_ATTESTATION_TYP, kid: opts.kid }));
    const payload = b64url(JSON.stringify(parsed.data));
    const signature = sign(null, Buffer.from(`${header}.${payload}`), key);
    return `${header}.${payload}.${b64url(signature)}`;
}

/**
 * Contrôle symétrique d'une attestation OrganiGrad (utilisé par les tests et
 * disponible pour une vérification locale) : forme, signature, `typ`, claims.
 */
export function verifyOrganigradAttestation(
    jws: unknown,
    opts: { publicKeys: Record<string, string>; now?: number },
): OrganigradAttestationClaims {
    const { header, payload } = verifyCompactEdDsaJws(jws, opts.publicKeys);
    if (header.typ !== ORGANIGRAD_ATTESTATION_TYP) throw new IdentityAssertionError('UNSUPPORTED_HEADER');
    const parsed = attestationClaimsSchema.safeParse(payload);
    if (!parsed.success) throw new IdentityAssertionError('INVALID_CLAIMS');
    const claims = parsed.data;
    if (claims.expiresAt - claims.issuedAt !== attestationLifetimeSeconds(claims.purpose)) throw new IdentityAssertionError('BAD_LIFETIME');
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (claims.issuedAt > now + CLOCK_SKEW_S) throw new IdentityAssertionError('NOT_YET_VALID');
    if (claims.expiresAt <= now) throw new IdentityAssertionError('EXPIRED');
    return claims;
}
