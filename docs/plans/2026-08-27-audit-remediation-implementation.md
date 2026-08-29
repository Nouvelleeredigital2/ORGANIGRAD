# Remédiation de l’audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** éliminer les défauts de sécurité, de disponibilité de la vue
Orchestration, de retour utilisateur PDF et de construction Docker relevés par
l’audit.

**Architecture:** les vues indépendantes de la source RH ne sont plus bloquées
par son chargement. Les dépendances sensibles sont versionnées localement, et
les images Docker installent exactement le lockfile sans recevoir de secrets.

**Tech Stack:** React, TypeScript, Vite, Playwright, Vitest, Docker, npm.

---

### Task 1: Régression Orchestration et PDF

**Files:** `e2e/audit-derniers-points.spec.ts`, `e2e/export-pdf.spec.ts`,
`src/App.tsx`.

1. Ajouter les attentes qui échouent avec une source CSV indisponible et après
   l’expiration du toast PDF courant.
2. Exécuter les specs ciblées et constater l’échec.
3. Ne déroger au loader global que pour Orchestration ; donner au succès PDF
   une durée dédiée de 15 secondes.
4. Rejouer les specs ciblées puis committer.

### Task 2: Dépendance XLSX

**Files:** `package.json`, `package-lock.json`, `vendor/xlsx-0.20.3.tgz`,
`scripts/audit-gate.mjs`, `docs/security/dependances.md`.

1. Constater l’échec de `npm audit --omit=dev --audit-level=high`.
2. Pointer `xlsx` vers le tarball 0.20.3 et actualiser le lockfile.
3. Retirer l’exception devenue obsolète et documenter provenance/hash.
4. Vérifier audit et tests d’import puis committer.

### Task 3: Image orchestrateur

**Files:** `orchestrator/tests/dockerfile.test.ts`, `orchestrator/Dockerfile`,
`orchestrator/.dockerignore`.

1. Écrire un test de contrat Dockerfile/dockerignore et constater son échec.
2. Copier le dossier `vendor/` avant `npm ci`, remplacer `npm install` par
   `npm ci`, et exclure secrets/artefacts.
3. Vérifier le test, le build TypeScript et, si le démon Docker est lancé,
   construire l’image.
4. Committer.

### Task 4: Nettoyage sûr et vérification globale

**Files:** artefacts ignorés uniquement.

1. Supprimer seulement `lint-out.txt`, `lint-results.json` et `vite-dev.log`.
2. Exécuter check frontend, check/build orchestrateur, E2E, audit et
   `git diff --check`.
3. Committer les modifications suivies ; rapporter séparément toute limite
   externe, dont la recette Supabase connectée ou un démon Docker arrêté.
