import { describe, it, expect } from 'vitest';
import { loadEnv, EnvValidationError } from '../src/config/env.js';

describe('loadEnv (validation des variables d\'environnement)', () => {
    it('mode memory sans SUPABASE_DB_URL', () => {
        const env = loadEnv({});
        expect(env.mode).toBe('memory');
        expect(env.port).toBe(3001);
    });

    it('mode pg avec une connection string postgres valide', () => {
        // Hôte `localhost` volontaire : un DSN de test ne doit pas ressembler à
        // une chaîne de connexion réelle, sous peine de faire hurler le contrôle
        // anti-secrets de la CI pour rien.
        const env = loadEnv({ SUPABASE_DB_URL: 'postgresql://user:pass@localhost:5432/db' });
        expect(env.mode).toBe('pg');
        expect(env.supabaseDbUrl).toContain('postgresql://');
    });

    it('rejette un PORT invalide', () => {
        expect(() => loadEnv({ PORT: 'abc' })).toThrow(EnvValidationError);
        expect(() => loadEnv({ PORT: '70000' })).toThrow(EnvValidationError);
    });

    it('rejette une SUPABASE_DB_URL non postgres', () => {
        expect(() => loadEnv({ SUPABASE_DB_URL: 'https://nope' })).toThrow(/postgres/);
    });

    it('rejette une APP_URL non http', () => {
        expect(() => loadEnv({ APP_URL: 'ftp://x' })).toThrow(EnvValidationError);
    });

    it('exige la clé service_role si EMAIL_EDGE_FUNCTION_URL est défini', () => {
        expect(() =>
            loadEnv({ EMAIL_EDGE_FUNCTION_URL: 'https://x.functions.supabase.co/notify-email' }),
        ).toThrow(/SERVICE_ROLE/);
        expect(
            loadEnv({
                EMAIL_EDGE_FUNCTION_URL: 'https://x.functions.supabase.co/notify-email',
                SUPABASE_SERVICE_ROLE_KEY: 'k',
            }).emailEdgeFunctionUrl,
        ).toBeDefined();
    });

    it('parse CORS_ALLOWED_ORIGINS en liste', () => {
        const env = loadEnv({ CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com ,' });
        expect(env.corsAllowedOrigins).toEqual(['https://a.com', 'https://b.com']);
    });

    it('LINK_BASE_URL/TOKEN absents : pont désactivé, pas d\'erreur', () => {
        const env = loadEnv({});
        expect(env.linkBaseUrl).toBeUndefined();
        expect(env.linkBridgeToken).toBeUndefined();
    });

    it('exige LINK_BASE_URL si LINK_BRIDGE_TOKEN est défini', () => {
        expect(() => loadEnv({ LINK_BRIDGE_TOKEN: 't' })).toThrow(/LINK_BASE_URL/);
    });

    it('rejette une LINK_BASE_URL non http', () => {
        expect(() => loadEnv({ LINK_BASE_URL: 'ftp://x' })).toThrow(EnvValidationError);
    });

    it('accepte LINK_BASE_URL + LINK_BRIDGE_TOKEN valides', () => {
        const env = loadEnv({
            LINK_BASE_URL: 'https://link.nouvelleeredigital.fr',
            LINK_BRIDGE_TOKEN: 't',
        });
        expect(env.linkBaseUrl).toBe('https://link.nouvelleeredigital.fr');
        expect(env.linkBridgeToken).toBe('t');
    });

    it('ne révèle jamais les valeurs dans le message d\'erreur', () => {
        try {
            loadEnv({ SUPABASE_DB_URL: 'https://secret-host-value' });
            expect.fail('aurait dû lever');
        } catch (e) {
            expect((e as Error).message).not.toContain('secret-host-value');
        }
    });
});
