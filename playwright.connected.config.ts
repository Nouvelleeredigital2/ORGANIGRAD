import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Configuration E2E **connectée** — Supabase réel.
 *
 * Volontairement séparée de `playwright.config.ts` : la suite hermétique force
 * Supabase OFF (`--mode test`), ce qui met la SPA en mode local où TOUT est
 * permis et où aucun channel Realtime n'existe. Les deux ne peuvent donc pas
 * cohabiter dans la même configuration, et la suite connectée ne doit jamais
 * s'exécuter par accident dans la CI hermétique — d'où une commande dédiée :
 *
 *     npm run test:e2e:connected
 *
 * Prérequis : copier `.env.connected.example` vers `.env.connected` (gitignoré)
 * et le renseigner avec un projet Supabase de TEST — jamais la production : les
 * tests créent puis suppriment des nœuds.
 */

const FICHIER_ENV = '.env.connected';

/**
 * Charge `.env.connected` dans `process.env`. Analyseur minimal plutôt qu'une
 * dépendance `dotenv` : le fichier n'a que des paires `CLE=valeur`, et les
 * tests eux-mêmes ont besoin de ces valeurs côté Node (client Supabase) autant
 * que Vite en a besoin côté navigateur.
 */
function chargerEnv(): Record<string, string> {
    if (!existsSync(FICHIER_ENV)) return {};
    const valeurs: Record<string, string> = {};
    for (const ligne of readFileSync(FICHIER_ENV, 'utf8').split('\n')) {
        const nette = ligne.trim();
        if (!nette || nette.startsWith('#')) continue;
        const separateur = nette.indexOf('=');
        if (separateur === -1) continue;
        const cle = nette.slice(0, separateur).trim();
        const valeur = nette.slice(separateur + 1).trim().replace(/^["']|["']$/g, '');
        valeurs[cle] = valeur;
        process.env[cle] ??= valeur;
    }
    return valeurs;
}

const env = chargerEnv();

export default defineConfig({
    testDir: './e2e-connected',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5175',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        // Port distinct de la suite hermétique (5174) pour que les deux puissent
        // tourner sans se marcher dessus.
        command: 'npx vite --port 5175 --mode connected',
        url: 'http://localhost:5175',
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
            VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? '',
            VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? '',
        },
    },
});
