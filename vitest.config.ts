import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // Les worktrees locaux peuvent contenir une seconde copie des suites
    // frontend, e2e et orchestrateur ; Vitest ne doit tester que le checkout
    // courant (chaque worktree exécute ses propres commandes).
    // `e2e-connected/**` : suites Playwright, comme `e2e/**`. Ramassées par
    // Vitest elles échouent sur « Playwright Test did not expect
    // test.describe() to be called here » — un échec sans rapport avec leur
    // contenu, et qui masque le reste de la suite.
    exclude: [
      'node_modules/**',
      'e2e/**',
      'e2e-connected/**',
      'dist/**',
      'orchestrator/**',
      '.worktrees/**',
    ],
    // Hermétisme (Priorité 8) : neutralise toute config réelle qui pourrait fuiter
    // de .env.local dans les tests — Supabase/orchestrateur restent NON configurés,
    // donc aucun client réseau réel n'est instancié.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_ORCHESTRATOR_URL: '',
    },
    testTimeout: 10000,
  },
});
