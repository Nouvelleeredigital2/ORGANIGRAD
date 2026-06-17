import { beforeEach, afterEach, vi } from 'vitest';

/**
 * Harnais hermétique (Priorité 8).
 *
 * Tout appel réseau NON mocké échoue immédiatement : les tests doivent injecter
 * `fetchImpl` / `sql` / `lookup` et ne JAMAIS contacter Slack, Supabase, un MCP
 * ou un DNS réel. Aucune variable d'environnement de production (.env.*) n'est
 * chargée par le harnais.
 */
beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn(() =>
            Promise.reject(
                new Error('[hermetic] Appel réseau non mocké — injecte un fetchImpl dans le test.'),
            ),
        ),
    );
    // Pare-feu contre une connexion Postgres réelle via getSql().
    delete process.env.SUPABASE_DB_URL;
});

afterEach(() => {
    vi.unstubAllGlobals();
});
