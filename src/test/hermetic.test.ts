import { describe, it, expect } from 'vitest';

/**
 * Vérifie l'hermétisme du harnais front : pas de réseau réel, Supabase non
 * configuré (aucune fuite de .env.local).
 */
describe('harnais hermétique (front)', () => {
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
