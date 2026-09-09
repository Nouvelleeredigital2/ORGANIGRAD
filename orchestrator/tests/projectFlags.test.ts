import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('activation explicite des projets', () => {
    const pg = { SUPABASE_DB_URL: 'postgres://test:test@127.0.0.1:5432/test', SUPABASE_JWT_SECRET: 'test-only' };
    it('reste désactivée par défaut', () => {
        expect(loadEnv(pg).projectsEnabled).toBe(false);
    });
    it('accepte true avec persistance et sessions humaines', () => {
        expect(loadEnv({...pg, PROJECTS_ENABLED:'true'}).projectsEnabled).toBe(true);
    });
    it('refuse une valeur ambiguë', () => {
        expect(() => loadEnv({...pg, PROJECTS_ENABLED:'yes'})).toThrow(/PROJECTS_ENABLED/);
    });
    it('refuse l’activation sans base ou sans vérification de session', () => {
        expect(() => loadEnv({ORCHESTRATOR_ALLOW_MEMORY:'1',PROJECTS_ENABLED:'true'})).toThrow(/PROJECTS_ENABLED/);
        expect(() => loadEnv({SUPABASE_DB_URL:pg.SUPABASE_DB_URL,PROJECTS_ENABLED:'true'})).toThrow(/PROJECTS_ENABLED/);
    });
});
