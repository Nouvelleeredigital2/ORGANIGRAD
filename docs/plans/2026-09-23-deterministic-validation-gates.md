# Deterministic Validation Gates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendre les validations locales reproductibles sans modifier le comportement produit.

**Architecture:** Neutraliser explicitement l'URL de l'orchestrateur dans l'environnement Playwright hors ligne, exclure les worktrees du périmètre ESLint et limiter la concurrence Vitest au niveau des deux configurations qui ont montré des défaillances sous charge. Les changements restent dans les harnais de test et la configuration d'outillage.

**Tech Stack:** Vite, Vitest, Playwright, ESLint, npm.

---

### Task 1: Verrouiller l'environnement E2E hors ligne

**Files:**
- Modify: `.env.test`
- Modify: `src/test/hermetic.test.ts`

1. Ajouter un test qui lit `.env.test` et exige des valeurs vides explicites pour `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `VITE_ORCHESTRATOR_URL`.
2. Exécuter `npx vitest run src/test/hermetic.test.ts --maxWorkers=1` et constater l'échec sur la clé orchestrateur absente.
3. Ajouter `VITE_ORCHESTRATOR_URL=` à `.env.test`.
4. Réexécuter le test ciblé, puis `npm run test:e2e` sans surcharge shell.

### Task 2: Borner le périmètre ESLint

**Files:**
- Modify: `eslint.config.js`
- Modify: `src/test/hermetic.test.ts`

1. Ajouter un test qui exige l'exclusion `.worktrees/**` dans la configuration ESLint.
2. Exécuter le test ciblé et constater l'échec.
3. Ajouter `.worktrees/**` aux exclusions globales.
4. Réexécuter le test ciblé, puis `npm run lint` depuis la racine.

### Task 3: Réduire la contention Vitest

**Files:**
- Modify: `vitest.config.ts`
- Modify: `orchestrator/vitest.config.ts`

1. Exécuter les suites complètes avec `--maxWorkers=1` pour confirmer que la sérialisation élimine les échecs intermittents observés pendant l'audit.
2. Définir `maxWorkers: 1` dans les deux configurations si et seulement si ces exécutions passent avec les délais actuels.
3. Exécuter `npm test` deux fois à la racine.
4. Exécuter `npm test` deux fois dans `orchestrator/`.

### Task 4: Validation consolidée et mémoire opérationnelle

**Files:**
- Modify in the audited checkout: `tasks/CURRENT.md`
- Modify in the audited checkout: `tasks/BACKLOG.md`
- Modify in the audited checkout: `docs/testing.md`
- Modify in the audited checkout: `docs/KNOWN_ISSUES.md`
- Create in the audited checkout: `tasks/completed/2026-09-23-deterministic-validation-gates.md`

1. Exécuter `npm run typecheck`, `npm run build`, `npm run lint` et `npm run test:e2e` à la racine.
2. Exécuter `npm run typecheck` et `npm run build` dans `orchestrator/`.
3. Vérifier le diff et confirmer qu'aucun secret ni comportement produit n'a changé.
4. Reporter les preuves, les limites et le statut réel dans la mémoire opérationnelle.
