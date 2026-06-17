import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['node_modules/**', 'e2e/**', 'dist/**', 'orchestrator/**'],
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
