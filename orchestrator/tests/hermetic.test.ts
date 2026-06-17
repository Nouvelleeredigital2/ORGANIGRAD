import { describe, it, expect } from 'vitest';

/**
 * Vérifie que le harnais est hermétique : aucun appel réseau réel ne passe et
 * aucune connexion DB n'est configurée par défaut.
 */
describe('harnais hermétique', () => {
    it('un fetch global non mocké échoue immédiatement', async () => {
        await expect(fetch('https://example.com')).rejects.toThrow(/non mocké/i);
    });

    it('SUPABASE_DB_URL n\'est pas défini (pas de connexion Postgres réelle)', () => {
        expect(process.env.SUPABASE_DB_URL).toBeUndefined();
    });
});
