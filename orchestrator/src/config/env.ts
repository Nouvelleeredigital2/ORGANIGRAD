/**
 * Validation centralisée des variables d'environnement (Phase 1).
 *
 * Le démarrage échoue avec un message CLAIR (noms de variables uniquement —
 * jamais les valeurs) si une variable requise manque ou est invalide. Sans
 * dépendance externe (équivalent Zod) pour rester portable et testable.
 */

export type OrchestratorMode = 'pg' | 'memory';

import { validPrivateIssuer, validPrivateOrigin } from '../api/privateProjectRoutes.js';

export interface OrchestratorEnv {
    mode: OrchestratorMode;
    projectsEnabled: boolean;
    circuitsEnabled: boolean;
    projectServiceDelegationsEnabled: boolean;
    /** Livraison Orvion sous reçu : exige délégations + circuits, une origine Orvion qualifiée et un fichier de mandat. */
    circuitDeliveryEnabled: boolean;
    orvionBaseUrl?: string;
    orvionQualifiedOrigin?: string;
    /** Chemin du fichier contenant l'UUID du mandat Orvion ; son contenu n'est jamais journalisé. */
    orvionServiceMandateFile?: string;
    circuitSchedulerEnabled: boolean;
    circuitSchedulerProjectIds: string[];
    privateProjectsEnabled: boolean;
    privateProjectsIssuer?: string;
    port: number;
    appUrl?: string;
    supabaseDbUrl?: string;
    supabaseServiceRoleKey?: string;
    emailEdgeFunctionUrl?: string;
    slackValidations?: string;
    slackFlux?: string;
    corsAllowedOrigins: string[];
    integrationEncryptionKey?: string;
    supabaseJwtSecret?: string;
    /**
     * URL JWKS du projet Supabase — requise pour vérifier les sessions des
     * projets migrés vers les « JWT signing keys » (jetons ES256).
     */
    supabaseJwksUrl?: string;
    /** Base URL de l'API LINK — requise pour importer les bots Hermes/LINK. */
    linkBaseUrl?: string;
    /** Token Bearer du pont LINK (GET /api/bridge/agents), jamais exposé au client. */
    linkBridgeToken?: string;
    /**
     * Pont LINK ↔ hub Synapse (décisions relayées par acteur signé, attestations
     * d'identité). `LINK_BRIDGE_ENABLED=1` exige les quatre variables ci-dessous ;
     * les fichiers sont lus par le bootstrap (`loadLinkBridgeConfig`).
     */
    linkBridgeEnabled: boolean;
    /** Fichier JSON `{kid: pem}` des clés publiques Ed25519 épinglées du hub. */
    linkBridgeHubPublicKeysFile?: string;
    /** `kid` des attestations OrganiGrad. */
    organigradIdentitySigningKid?: string;
    /** Fichier PEM PKCS8 de la clé privée Ed25519 d'OrganiGrad. ⚠️ SECRET (chemin seulement ici). */
    organigradIdentitySigningPrivateKeyFile?: string;
    /** Base https du hub pour `POST /api/identity-links/<action>`. */
    identityLinksHubUrl?: string;
}

export class EnvValidationError extends Error {
    constructor(public readonly issues: string[]) {
        super(`Configuration invalide :\n - ${issues.join('\n - ')}`);
        this.name = 'EnvValidationError';
    }
}

function isHttpUrl(v: string): boolean {
    try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Valide `process.env` (ou une source injectée) et renvoie une config typée.
 * Lève `EnvValidationError` en listant les variables fautives (sans valeurs).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): OrchestratorEnv {
    const issues: string[] = [];

    // Mode déterminé par la présence de SUPABASE_DB_URL.
    const dbUrl = source.SUPABASE_DB_URL?.trim() || undefined;
    const mode: OrchestratorMode = dbUrl ? 'pg' : 'memory';

    // Le mode in-memory n'a AUCUNE authentification et écoute 0.0.0.0 : il ne
    // doit jamais être sélectionné par l'absence accidentelle d'une variable
    // (déploiement où SUPABASE_DB_URL a sauté). Opt-in explicite obligatoire.
    if (mode === 'memory' && source.ORCHESTRATOR_ALLOW_MEMORY?.trim() !== '1') {
        issues.push(
            'SUPABASE_DB_URL est absente. Pour démarrer VOLONTAIREMENT le mode in-memory (dev/test, SANS authentification), poser ORCHESTRATOR_ALLOW_MEMORY=1',
        );
    }

    // PORT
    const portRaw = source.PORT?.trim();
    const port = portRaw ? Number(portRaw) : 3001;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        issues.push('PORT doit être un entier entre 1 et 65535');
    }

    // URLs optionnelles — si présentes, doivent être valides.
    const urlChecks: Array<[string, string | undefined]> = [
        ['SUPABASE_DB_URL', dbUrl],
        ['APP_URL', source.APP_URL?.trim() || undefined],
        ['EMAIL_EDGE_FUNCTION_URL', source.EMAIL_EDGE_FUNCTION_URL?.trim() || undefined],
        ['SLACK_VALIDATIONS', source.SLACK_VALIDATIONS?.trim() || undefined],
        ['SLACK_FLUX', source.SLACK_FLUX?.trim() || undefined],
        ['SUPABASE_JWKS_URL', source.SUPABASE_JWKS_URL?.trim() || undefined],
        ['LINK_BASE_URL', source.LINK_BASE_URL?.trim() || undefined],
    ];
    for (const [name, value] of urlChecks) {
        if (value !== undefined && name !== 'SUPABASE_DB_URL' && !isHttpUrl(value)) {
            issues.push(`${name} doit être une URL http(s) valide`);
        }
    }
    if (dbUrl !== undefined && !/^postgres(ql)?:\/\//.test(dbUrl)) {
        issues.push('SUPABASE_DB_URL doit être une connection string postgres://');
    }

    // En mode pg, l'e-mail exige la clé service_role pour authentifier l'appel.
    const emailUrl = source.EMAIL_EDGE_FUNCTION_URL?.trim() || undefined;
    const serviceRole = source.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
    if (emailUrl && !serviceRole) {
        issues.push(
            'SUPABASE_SERVICE_ROLE_KEY est requise quand EMAIL_EDGE_FUNCTION_URL est défini',
        );
    }

    // Pont LINK : le token n'a de sens qu'avec une base URL.
    const linkBaseUrl = source.LINK_BASE_URL?.trim() || undefined;
    const linkBridgeToken = source.LINK_BRIDGE_TOKEN?.trim() || undefined;
    if (linkBridgeToken && !linkBaseUrl) {
        issues.push('LINK_BASE_URL est requise quand LINK_BRIDGE_TOKEN est défini');
    }

    // Clé de chiffrement des secrets (optionnelle) : si présente, doit décoder
    // en 32 octets (AES-256).
    const encKey = source.INTEGRATION_ENCRYPTION_KEY?.trim() || undefined;
    if (encKey !== undefined && Buffer.from(encKey, 'base64').length !== 32) {
        issues.push('INTEGRATION_ENCRYPTION_KEY doit être 32 octets encodés en base64');
    }

    const projectsRaw = source.PROJECTS_ENABLED?.trim() || 'false';
    const projectsEnabled = projectsRaw === 'true';
    if (!['true', 'false'].includes(projectsRaw)) {
        issues.push('PROJECTS_ENABLED doit valoir true ou false');
    }
    if (projectsEnabled && (mode !== 'pg' || !(source.SUPABASE_JWT_SECRET?.trim() || source.SUPABASE_JWKS_URL?.trim()))) {
        issues.push('PROJECTS_ENABLED exige Postgres et une configuration de vérification des sessions humaines');
    }

    const privateRaw = source.PRIVATE_PROJECTS_ENABLED?.trim() || 'false';
    const privateProjectsEnabled = privateRaw === 'true';
    const privateProjectsIssuer = source.PRIVATE_PROJECTS_JWT_ISSUER?.trim() || undefined;
    if (!['true','false'].includes(privateRaw)) issues.push('PRIVATE_PROJECTS_ENABLED doit valoir true ou false');
    if (privateProjectsEnabled) {
        if (mode !== 'pg' || !(source.SUPABASE_JWT_SECRET?.trim() || source.SUPABASE_JWKS_URL?.trim())) {
            issues.push('PRIVATE_PROJECTS_ENABLED exige Postgres et un vérificateur JWT');
        }
        if (!privateProjectsIssuer || !validPrivateIssuer(privateProjectsIssuer)) {
            issues.push('PRIVATE_PROJECTS_JWT_ISSUER doit être un issuer HTTPS explicite /auth/v1');
        }
        const origins = (source.CORS_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
        if (!origins.length || !origins.every(validPrivateOrigin)) {
            issues.push('PRIVATE_PROJECTS_ENABLED exige CORS_ALLOWED_ORIGINS avec des origines HTTPS explicites');
        }
    }

    const circuitsRaw=source.CIRCUITS_ENABLED?.trim() || 'false';
    const circuitsEnabled=circuitsRaw==='true';
    if(!['true','false'].includes(circuitsRaw))issues.push('CIRCUITS_ENABLED doit valoir true ou false');
    if(circuitsEnabled && (!projectsEnabled || mode!=='pg' || !source.APP_URL?.startsWith('https://')))issues.push('CIRCUITS_ENABLED exige les projets authentifiés, Postgres et APP_URL HTTPS');

    const delegationsRaw=source.PROJECT_SERVICE_DELEGATIONS_ENABLED?.trim() || 'false';
    const projectServiceDelegationsEnabled=delegationsRaw==='true';
    if(!['true','false'].includes(delegationsRaw))issues.push('PROJECT_SERVICE_DELEGATIONS_ENABLED doit valoir true ou false');
    if(projectServiceDelegationsEnabled&&!circuitsEnabled)issues.push('PROJECT_SERVICE_DELEGATIONS_ENABLED exige CIRCUITS_ENABLED');

    const deliveryRaw=source.CIRCUIT_DELIVERY_ENABLED?.trim() || 'false';
    const circuitDeliveryEnabled=deliveryRaw==='true';
    const orvionBaseUrl=source.ORVION_BASE_URL?.trim() || undefined;
    const orvionQualifiedOrigin=source.ORVION_QUALIFIED_ORIGIN?.trim() || undefined;
    const orvionServiceMandateFile=source.ORVION_SERVICE_MANDATE_FILE?.trim() || undefined;
    if(!['true','false'].includes(deliveryRaw))issues.push('CIRCUIT_DELIVERY_ENABLED doit valoir true ou false');
    if(circuitDeliveryEnabled) {
        if(!projectServiceDelegationsEnabled||!circuitsEnabled)issues.push('CIRCUIT_DELIVERY_ENABLED exige PROJECT_SERVICE_DELEGATIONS_ENABLED et CIRCUITS_ENABLED');
        let base:URL|undefined;
        try { base=new URL(orvionBaseUrl??''); } catch { base=undefined; }
        if(!base||base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')issues.push('ORVION_BASE_URL doit être une origine HTTPS nue (https://hote[:port]/)');
        if(!orvionQualifiedOrigin||!base||orvionQualifiedOrigin!==base.origin)issues.push("ORVION_QUALIFIED_ORIGIN doit être exactement l'origine d'ORVION_BASE_URL");
        if(!orvionServiceMandateFile)issues.push('ORVION_SERVICE_MANDATE_FILE doit désigner le fichier contenant le mandat Orvion');
    }
    const schedulerRaw=source.CIRCUIT_SCHEDULER_ENABLED?.trim() || 'false';
    const circuitSchedulerEnabled=schedulerRaw==='true';
    const circuitSchedulerProjectIds=[...new Set((source.CIRCUIT_SCHEDULER_PROJECT_IDS??'').split(',').map(id=>id.trim().toLowerCase()).filter(Boolean))];
    if(!['true','false'].includes(schedulerRaw))issues.push('CIRCUIT_SCHEDULER_ENABLED doit valoir true ou false');
    if(circuitSchedulerEnabled&&!circuitsEnabled)issues.push('CIRCUIT_SCHEDULER_ENABLED exige CIRCUITS_ENABLED');
    if(circuitSchedulerProjectIds.some(id=>! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) || (circuitSchedulerEnabled&&!circuitSchedulerProjectIds.length))issues.push('CIRCUIT_SCHEDULER_PROJECT_IDS exige une liste explicite de UUID de projets');

    // Pont LINK ↔ hub Synapse : opt-in explicite, configuration complète ou échec.
    const linkBridgeRaw=source.LINK_BRIDGE_ENABLED?.trim() || '0';
    const linkBridgeEnabled=linkBridgeRaw==='1';
    if(!['0','1'].includes(linkBridgeRaw))issues.push('LINK_BRIDGE_ENABLED doit valoir 0 ou 1');
    const linkBridgeHubPublicKeysFile=source.LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE?.trim() || undefined;
    const organigradIdentitySigningKid=source.ORGANIGRAD_IDENTITY_SIGNING_KID?.trim() || undefined;
    const organigradIdentitySigningPrivateKeyFile=source.ORGANIGRAD_IDENTITY_SIGNING_PRIVATE_KEY_FILE?.trim() || undefined;
    const identityLinksHubUrl=source.IDENTITY_LINKS_HUB_URL?.trim() || undefined;
    if(linkBridgeEnabled){
        if(mode!=='pg')issues.push('LINK_BRIDGE_ENABLED exige Postgres');
        if(!source.APP_URL?.trim().startsWith('https://'))issues.push('LINK_BRIDGE_ENABLED exige APP_URL HTTPS (référence canonique de projet)');
        if(!(source.SUPABASE_JWT_SECRET?.trim() || source.SUPABASE_JWKS_URL?.trim()))issues.push('LINK_BRIDGE_ENABLED exige une vérification des sessions humaines (SUPABASE_JWT_SECRET ou SUPABASE_JWKS_URL)');
        if(!linkBridgeHubPublicKeysFile)issues.push('LINK_BRIDGE_HUB_PUBLIC_KEYS_FILE est requise quand LINK_BRIDGE_ENABLED=1');
        if(!organigradIdentitySigningKid||organigradIdentitySigningKid.length>128)issues.push('ORGANIGRAD_IDENTITY_SIGNING_KID est requise (≤ 128 caractères) quand LINK_BRIDGE_ENABLED=1');
        if(!organigradIdentitySigningPrivateKeyFile)issues.push('ORGANIGRAD_IDENTITY_SIGNING_PRIVATE_KEY_FILE est requise quand LINK_BRIDGE_ENABLED=1');
        if(!identityLinksHubUrl||!isHttpUrl(identityLinksHubUrl)||!identityLinksHubUrl.startsWith('https://'))issues.push('IDENTITY_LINKS_HUB_URL doit être une URL https quand LINK_BRIDGE_ENABLED=1');
    }

    if (issues.length > 0) {
        throw new EnvValidationError(issues);
    }

    return {
        mode,
        projectsEnabled,
        circuitsEnabled,
        projectServiceDelegationsEnabled,
        circuitDeliveryEnabled,
        orvionBaseUrl,
        orvionQualifiedOrigin,
        orvionServiceMandateFile,
        circuitSchedulerEnabled,
        circuitSchedulerProjectIds,
        privateProjectsEnabled,
        privateProjectsIssuer,
        port,
        appUrl: source.APP_URL?.trim() || undefined,
        supabaseDbUrl: dbUrl,
        supabaseServiceRoleKey: serviceRole,
        emailEdgeFunctionUrl: emailUrl,
        slackValidations: source.SLACK_VALIDATIONS?.trim() || undefined,
        slackFlux: source.SLACK_FLUX?.trim() || undefined,
        corsAllowedOrigins: (source.CORS_ALLOWED_ORIGINS ?? '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
        integrationEncryptionKey: encKey,
        supabaseJwtSecret: source.SUPABASE_JWT_SECRET?.trim() || undefined,
        supabaseJwksUrl: source.SUPABASE_JWKS_URL?.trim() || undefined,
        linkBaseUrl,
        linkBridgeToken,
        linkBridgeEnabled,
        linkBridgeHubPublicKeysFile,
        organigradIdentitySigningKid,
        organigradIdentitySigningPrivateKeyFile,
        identityLinksHubUrl,
    };
}
