import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ne jamais linter les sorties de build, les dépendances, ni les artefacts
  // générés localement par le CLI Supabase (`supabase start`) — non versionnés,
  // ils ne suivent aucune convention du dépôt et faussaient les rapports de
  // lint (208 erreurs fantômes constatées lors de l'audit du 2026-08-29).
  globalIgnores([
    'dist',
    '**/dist/**',
    'coverage',
    'test-results',
    'playwright-report',
    'node_modules',
    'supabase/.temp/**',
    'supabase/.branches/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
