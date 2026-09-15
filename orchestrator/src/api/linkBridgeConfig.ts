/**
 * Lecture au démarrage de la configuration du pont LINK ↔ hub Synapse.
 *
 * `loadEnv` ne lit que des variables ; ici on ouvre les DEUX fichiers
 * (clés publiques épinglées du hub, clé privée de signature d'OrganiGrad) et
 * on refuse de démarrer si l'un manque ou n'est pas une clé Ed25519 valide.
 * Les messages ne contiennent que des noms de variables et de chemins — jamais
 * le contenu des fichiers.
 */
import { readFileSync } from 'node:fs';
import type { OrchestratorEnv } from '../config/env.js';
import { assertPinnedPublicKeys, assertSigningPrivateKey } from './identityAssertions.js';
import type { LinkBridgeConfig } from './linkBridgeRoutes.js';

export class LinkBridgeConfigError extends Error {
    constructor(message: string) {
        super(`Pont LINK : ${message}`);
        this.name = 'LinkBridgeConfigError';
    }
}

function readText(path: string, label: string): string {
    try {
        return readFileSync(path, 'utf8');
    } catch {
        throw new LinkBridgeConfigError(`${label} illisible (${path})`);
    }
}

/** Renvoie `undefined` si le pont est désactivé ; lève si activé et incomplet. */
export function loadLinkBridgeConfig(
    env: Pick<
        OrchestratorEnv,
        | 'linkBridgeEnabled'
        | 'linkBridgeHubPublicKeysFile'
        | 'organigradIdentitySigningKid'
        | 'organigradIdentitySigningPrivateKeyFile'
        | 'identityLinksHubUrl'
    >,
    readFile: (path: string, label: string) => string = readText,
): LinkBridgeConfig | undefined {
    if (!env.linkBridgeEnabled) return undefined;
    const { linkBridgeHubPublicKeysFile, organigradIdentitySigningKid, organigradIdentitySigningPrivateKeyFile, identityLinksHubUrl } = env;
    if (!linkBridgeHubPublicKeysFile || !organigradIdentitySigningKid || !organigradIdentitySigningPrivateKeyFile || !identityLinksHubUrl) {
        throw new LinkBridgeConfigError(
            'LINK_BRIDGE_ENABLED=1 exige LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE, ORGANIGRAD_IDENTITY_SIGNING_KID, ORGANIGRAD_IDENTITY_SIGNING_PRIVATE_KEY_FILE et IDENTITY_LINKS_HUB_URL',
        );
    }
    let hubPublicKeys: unknown;
    try {
        hubPublicKeys = JSON.parse(readFile(linkBridgeHubPublicKeysFile, 'LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE'));
    } catch (err) {
        if (err instanceof LinkBridgeConfigError) throw err;
        throw new LinkBridgeConfigError('LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE doit contenir un objet JSON {kid: pem}');
    }
    if (!hubPublicKeys || typeof hubPublicKeys !== 'object' || Array.isArray(hubPublicKeys)) {
        throw new LinkBridgeConfigError('LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE doit contenir un objet JSON {kid: pem}');
    }
    const keys = hubPublicKeys as Record<string, unknown>;
    if (!Object.values(keys).every((pem) => typeof pem === 'string')) {
        throw new LinkBridgeConfigError('LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE : chaque valeur doit être un PEM (chaîne)');
    }
    try {
        assertPinnedPublicKeys(keys as Record<string, string>);
    } catch {
        throw new LinkBridgeConfigError('LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE : au moins une clé, toutes publiques Ed25519');
    }
    const signingPrivateKeyPem = readFile(organigradIdentitySigningPrivateKeyFile, 'ORGANIGRAD_IDENTITY_SIGNING_PRIVATE_KEY_FILE');
    try {
        assertSigningPrivateKey(signingPrivateKeyPem);
    } catch {
        throw new LinkBridgeConfigError('ORGANIGRAD_IDENTITY_SIGNING_PRIVATE_KEY_FILE doit être une clé privée Ed25519 (PEM PKCS8)');
    }
    const hubUrl = new URL(identityLinksHubUrl);
    if (hubUrl.protocol !== 'https:' || hubUrl.username || hubUrl.password || hubUrl.search || hubUrl.hash) {
        throw new LinkBridgeConfigError('IDENTITY_LINKS_HUB_URL doit être une origine https sans identifiants ni query');
    }
    return {
        hubPublicKeys: keys as Record<string, string>,
        signingKid: organigradIdentitySigningKid,
        signingPrivateKeyPem,
        hubUrl: hubUrl.toString(),
    };
}
