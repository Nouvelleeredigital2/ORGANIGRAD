import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vérifie l'hermétisme du harnais front : pas de réseau réel, Supabase non
 * configuré (aucune fuite de .env.local).
 */
describe('harnais hermétique (front)', () => {
    it('neutralise explicitement les endpoints réseau dans .env.test', () => {
        const envTest = readFileSync(resolve(process.cwd(), '.env.test'), 'utf8');

        for (const variable of [
            'VITE_SUPABASE_URL',
            'VITE_SUPABASE_ANON_KEY',
            'VITE_ORCHESTRATOR_URL',
        ]) {
            expect(envTest, `${variable} doit être défini et vide dans .env.test`).toMatch(
                new RegExp(`^${variable}=[\\t ]*$`, 'm'),
            );
        }
    });

    it('exclut les worktrees locaux du lint global', () => {
        const eslintConfig = readFileSync(resolve(process.cwd(), 'eslint.config.js'), 'utf8');

        expect(eslintConfig).toContain("'.worktrees/**'");
    });

    it('un fetch non mocké échoue immédiatement', async () => {
        await expect(fetch('https://example.com')).rejects.toThrow(/non mocké/i);
    });

    it('EventSource non mocké lève', () => {
        expect(() => new EventSource('https://example.com')).toThrow(/non mocké/i);
    });

    it('Supabase n\'est PAS configuré en test (env neutralisé)', async () => {
        const { isSupabaseConfigured } = await import('../lib/supabase');
        expect(isSupabaseConfigured).toBe(false);
    });
});
