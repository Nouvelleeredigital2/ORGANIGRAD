/**
 * Validation centralisée des variables d'environnement (Phase 1).
 *
 * Le démarrage échoue avec un message CLAIR (noms de variables uniquement —
 * jamais les valeurs) si une variable requise manque ou est invalide. Sans
 * dépendance externe (équivalent Zod) pour rester portable et testable.
 */

export type OrchestratorMode = 'pg' | 'memory';

export interface OrchestratorEnv {
    mode: OrchestratorMode;
    port: number;
    appUrl?: string;
    supabaseDbUrl?: string;
    supabaseServiceRoleKey?: string;
    emailEdgeFunctionUrl?: string;
    slackValidations?: string;
    slackFlux?: string;
    corsAllowedOrigins: string[];
    integrationEncryptionKey?: string;
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

    // Clé de chiffrement des secrets (optionnelle) : si présente, doit décoder
    // en 32 octets (AES-256).
    const encKey = source.INTEGRATION_ENCRYPTION_KEY?.trim() || undefined;
    if (encKey !== undefined && Buffer.from(encKey, 'base64').length !== 32) {
        issues.push('INTEGRATION_ENCRYPTION_KEY doit être 32 octets encodés en base64');
    }

    if (issues.length > 0) {
        throw new EnvValidationError(issues);
    }

    return {
        mode,
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
    };
}
