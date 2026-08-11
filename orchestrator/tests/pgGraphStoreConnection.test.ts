import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * getSql() doit se connecter avec `prepare: false`. Le DSN de production
 * passe par le pooler Supabase en MODE TRANSACTION (port 6543,
 * Supavisor/PgBouncer) : ce mode réassigne la connexion Postgres backend à
 * chaque transaction, et un prepared statement créé sur l'une n'existe plus
 * sur la suivante — `prepared statement "…" does not exist`. Constaté en
 * recette connectée le 2026-08-09 : cette erreur a fait crasher tout le
 * process orchestrateur (cf. pgServer.test regordAudit).
 */

const postgresMock = vi.fn(() => ({}) as unknown);
vi.mock('postgres', () => ({ default: postgresMock }));

describe('getSql — configuration de connexion', () => {
    const ORIGINAL_ENV = process.env['SUPABASE_DB_URL'];

    beforeEach(() => {
        vi.resetModules();
        postgresMock.mockClear();
        // Hôte `localhost` volontaire : un DSN de test ne doit pas ressembler à
        // une chaîne de connexion réelle, sous peine de faire hurler le contrôle
        // anti-secrets de la CI pour rien (cf. env.test.ts, même convention).
        process.env['SUPABASE_DB_URL'] = 'postgres://user:pass@localhost:6543/postgres';
    });

    afterEach(() => {
        if (ORIGINAL_ENV === undefined) delete process.env['SUPABASE_DB_URL'];
        else process.env['SUPABASE_DB_URL'] = ORIGINAL_ENV;
    });

    it('désactive les prepared statements (compatibilité pooler transaction mode)', async () => {
        const { getSql } = await import('../src/state/pgGraphStore.js');
        getSql();
        expect(postgresMock).toHaveBeenCalledTimes(1);
        const call = postgresMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
        expect(call[1]?.['prepare']).toBe(false);
    });

    it('lève une erreur claire si SUPABASE_DB_URL est absent', async () => {
        delete process.env['SUPABASE_DB_URL'];
        const { getSql } = await import('../src/state/pgGraphStore.js');
        expect(() => getSql()).toThrow(/SUPABASE_DB_URL/);
    });
});
