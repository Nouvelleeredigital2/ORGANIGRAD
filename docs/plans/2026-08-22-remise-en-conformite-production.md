# Remise en conformité production — Implementation Plan

> Pour l’exécution : appliquer chaque tâche par TDD, avec vérification avant commit.

**Goal:** rendre Organigrad vérifiable de bout en bout, sans régression E2E, sans vulnérabilité élevée ouverte dans l'import XLSX, et avec des parcours connectés et de déploiement prouvés.

**Architecture:** séparer le chargement de la source RH des vues qui peuvent fonctionner avec leurs propres données locales, notamment l'orchestration. Les exports PDF doivent conserver un accusé de succès assez longtemps pour rester observable. Les contrôles restent séparés en trois niveaux : hermétique, PostgreSQL éphémère et Supabase de test.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, Fastify, PostgreSQL 16, Supabase.

---

## Constats

- Le contrôle complet frontend passe : lint, typecheck, 247 tests et build.
- Le contrôle de l’orchestrateur passe : 284 tests passés et 62 scénarios conditionnels sautés.
- PostgreSQL réel passe sur une base vierge et isolée : 5 tests de store et 11 tests de sécurité multi-workspace.
- L’E2E hermétique échoue de manière reproductible : 45 sur 47. La vue Orchestration reste derrière le chargement de data.csv; le toast de succès PDF disparaît avant la confirmation du téléchargement.
- L’audit npm signale une vulnérabilité haute non corrigée dans xlsx : prototype pollution et ReDoS.
- La recette connectée à Supabase et les contrôles de déploiement restent non exécutés : aucun environnement de test connecté n’est configuré.

### Task 1: Rendre l’orchestration indépendante du chargement CSV

**Files:**

- Modify: src/App.tsx
- Modify: src/hooks/useOrgChartController.ts
- Test: e2e/audit-derniers-points.spec.ts
- Test: e2e/orchestration.spec.ts

**Step 1: Write the failing test**

Démarrer avec data.csv lent ou indisponible et une fixture localStorage; vérifier que la route d’orchestration affiche un nœud local sans attendre la source RH.

**Step 2: Run test to verify it fails**

Run: npx playwright test e2e/audit-derniers-points.spec.ts --grep "un nœud peut être supprimé"

Expected: échec actuel sur le titre Orchestration, car App.tsx affiche le loader global.

**Step 3: Write minimal implementation**

Ne plus bloquer globalement la vue orchestration sur loading. Afficher la vue avec les agents RH éventuellement vides; OrchestrationView conserve son propre état de nœuds. Garder un état de chargement explicite uniquement pour les vues réellement dépendantes de la source RH.

**Step 4: Run test to verify it passes**

Run: npx playwright test e2e/audit-derniers-points.spec.ts

Expected: trois scénarios passés; le nœud supprimé reste absent après rechargement.

**Step 5: Commit**

Commit message: fix(orchestration): do not block local nodes on csv loading

### Task 2: Rendre le succès de l’export PDF durable et testable

**Files:**

- Modify: src/App.tsx
- Modify: src/feedback/FeedbackContext.ts
- Test: e2e/export-pdf.spec.ts
- Test: src/feedback/FeedbackProvider.test.tsx (create if absent)

**Step 1: Write the failing test**

Vérifier qu’un succès d’export reste visible pendant la fenêtre nécessaire au téléchargement ou jusqu’à fermeture manuelle. Le test inspecte d’abord le fichier PDF, puis le message.

**Step 2: Run test to verify it fails**

Run: npx playwright test e2e/export-pdf.spec.ts --grep "produit un PDF lisible"

Expected: échec actuel sur Export PDF terminé, alors que le fichier téléchargé est valide.

**Step 3: Write minimal implementation**

Utiliser une durée dédiée longue, par exemple 15 secondes, ou une confirmation fermée manuellement dans handleConfirmExport. Documenter la politique dans FeedbackContext; les erreurs restent persistantes.

**Step 4: Run test to verify it passes**

Run: npx playwright test e2e/export-pdf.spec.ts

Expected: quatre scénarios passés, incluant fichier lisible, export par lots et échec de rendu sans faux succès.

**Step 5: Commit**

Commit message: fix(export): keep PDF completion feedback observable

### Task 3: Éliminer la vulnérabilité haute de l’import XLSX

**Files:**

- Modify: package.json
- Modify: package-lock.json
- Modify: src/services/importService.ts
- Modify: src/services/sheetSecurity.ts
- Test: src/services/importService.test.ts
- Test: src/services/sheetSecurity.test.ts
- Modify: docs/security/dependances.md

**Step 1: Write the failing test**

Conserver les cas XLSX valides, les cellules de formules neutralisées, les fichiers hors limites et un fichier hostile minimal. Les tests portent sur le contrat métier, pas sur l’API de xlsx.

**Step 2: Run test to verify it fails**

Run: npm run test -- src/services/importService.test.ts src/services/sheetSecurity.test.ts

Expected: les tests de l’adaptateur actuel servent de référence; ajouter le cas de sécurité non couvert avant le remplacement.

**Step 3: Write minimal implementation**

Évaluer puis intégrer un parseur XLSX maintenu, compatible navigateur et sans audit high ou critical ouvert. Isoler son API dans importService, conserver les limites dans sheetSecurity avant toute analyse lourde et garder le chargement dynamique.

**Step 4: Run test to verify it passes**

Run: npm audit --omit=dev --audit-level=high
Run: npm run test -- src/services/importService.test.ts src/services/sheetSecurity.test.ts
Run: npm run build

Expected: tests verts, aucun audit high ou critical non accepté, import XLSX encore lazy.

**Step 5: Commit**

Commit message: fix(import): replace vulnerable xlsx parser

### Task 4: Rendre les tests PostgreSQL reproductibles en local

**Files:**

- Create: scripts/run-pg-integration.ps1
- Modify: package.json
- Modify: orchestrator/package.json
- Modify: docs/testing.md
- Modify: .github/workflows/ci.yml

**Step 1: Write the failing test**

Ajouter un contrôle de script qui échoue clairement si plusieurs suites exigeant une base vierge ciblent la même base.

**Step 2: Run test to verify it fails**

Run: définir TEST_DATABASE_URL sur une seule base puis lancer simultanément les suites pgGraphStore.integration et workspaceRpcSecurity.

Expected: échec de schéma, comme observé pendant cet audit.

**Step 3: Write minimal implementation**

Créer un script PowerShell qui démarre une base PostgreSQL jetable nommée, attend pg_isready, exécute une suite choisie, puis l’arrête dans un bloc finally. Exposer test:pg:graph, test:pg:security et test:pg:concurrency.

**Step 4: Run test to verify it passes**

Run: npm run test:pg:graph
Run: npm run test:pg:security
Run: npm run test:pg:concurrency

Expected: chaque commande démarre et nettoie sa base; aucune ne dépend d’un état laissé par la précédente.

**Step 5: Commit**

Commit message: test(pg): isolate reproducible integration suites

### Task 5: Exécuter et fiabiliser la recette Supabase connectée

**Files:**

- Modify: e2e-connected/*.spec.ts, seulement pour les assertions non déterministes constatées
- Modify: playwright.connected.config.ts
- Modify: docs/recette-staging-2026-08-05.md
- Modify: docs/deployment.md

**Step 1: Préparer un projet Supabase de test dédié**

Créer deux comptes dans deux workspaces distincts et un compte viewer. Renseigner les secrets uniquement dans le coffre CI.

**Step 2: Lancer la recette connectée manuelle**

Run: npm run test:e2e:connected

Expected: connexion, persistance, invitations, clés API, isolation A/B, rôle viewer et Realtime à deux consommateurs sont exécutés, sans scénario sauté faute d’identifiants.

**Step 3: Traiter chaque écart avec une preuve de reproduction**

Réduire d’abord l’échec à un test ciblé. Ne pas remplacer les scénarios connectés par des mocks.

**Step 4: Documenter les preuves**

Archiver numéro d’exécution CI, scénarios passés, versions des migrations et date dans la recette staging.

### Task 6: Clore les garanties de production

**Files:**

- Modify: orchestrator/src/security/crypto.ts
- Modify: orchestrator/src/state/pgGraphStore.ts ou la route d’écriture serveur concernée
- Modify: supabase/migrations/<timestamp>_encrypt_integration_secrets.sql
- Modify: docs/security/encryption-at-rest.md
- Modify: docs/deployment.md
- Modify: README.md

**Step 1: Write the failing test**

Vérifier qu’une valeur d’intégration est chiffrée au stockage, absente des DTO publics et inaccessible à un acteur non autorisé.

**Step 2: Run test to verify it fails**

Run: depuis orchestrator, npm test -- crypto api dto

Expected: échec tant que le chemin d’écriture chiffré de bout en bout n’existe pas.

**Step 3: Write minimal implementation**

Choisir une écriture par orchestrateur ou Edge Function. La SPA ne doit jamais enregistrer un webhook ou une URL MCP secrète en clair. Chiffrer à l’écriture, déchiffrer seulement côté service autorisé et ne jamais exposer la valeur dans les DTO.

**Step 4: Run test to verify it passes**

Run: npm run check
Run: dans orchestrator, npm run check puis npm run build
Run: npm run test:e2e
Run: npm run test:e2e:connected

Expected: tous les contrôles sont verts, aucune vulnérabilité haute non acceptée, et les preuves connectées et staging sont archivées.

**Step 5: Commit and tag**

Commit message: feat(security): encrypt integration secrets at rest
Tag: v1.0.0

## Définition de fonctionnelle à 100 %

Le jalon est atteint uniquement après les six tâches : E2E hermétiques et connectées vertes, contrôles PostgreSQL réels reproductibles, vérifications staging documentées et aucune vulnérabilité haute ou critique non corrigée ou explicitement acceptée avec date d’expiration.

