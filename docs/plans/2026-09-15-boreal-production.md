# Boréal Production Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Préparer localement un pilote éditorial Boréal Production traçable, idempotent et prêt à raccorder à LINK, Orvion et Engine, sans modifier Atelier Boréal ni publier quoi que ce soit.

**Architecture:** Organigrad reste le point de pilotage : il conserve la configuration du projet, ses étapes et l'état lisible du dossier. Un service de domaine construit les commandes avec un `ProjectRef`, un dossier, une version et une clé d'idempotence ; ses adaptateurs injectés appellent LINK, Orvion et Engine sans secret dans la SPA. L'activation des profils reste bloquée tant que le RPC contrôlé et le mandat Orvion décrits pour Claude ne sont pas installés.

**Tech Stack:** TypeScript, Fastify, Vitest, React 19, Vite, PostgreSQL/Supabase via migrations revues séparément.

---

### Task 1: Définir le contrat local du pilote et de ses commandes

**Files:**
- Create: `orchestrator/src/domain/borealProduction.ts`
- Create: `orchestrator/tests/borealProduction.test.ts`

**Step 1: Write the failing test**

Écrire des tests pour une commande de dossier qui : porte toujours un `ProjectRef`, un identifiant de dossier, une version et une clé d'idempotence ; refuse les champs vides ; limite les étapes à `veille`, `selection`, `redaction`, `brief_visuel`, `generation`, `controle`, `validation_finale`.

**Step 2: Run test to verify it fails**

Run: `npm test -- borealProduction.test.ts`

Expected: FAIL because the module does not exist.

**Step 3: Write minimal implementation**

Créer les types `ProjectRef`, `BorealStage`, `BorealCommand`, l'état `ENGINE_EN_ATTENTE` et les validateurs purs. Ne pas ajouter de lecture ou d'écriture SQL.

**Step 4: Run test to verify it passes**

Run: `npm test -- borealProduction.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add orchestrator/src/domain/borealProduction.ts orchestrator/tests/borealProduction.test.ts
git commit -m "feat: define Boreal production command contract"
```

### Task 2: Orchestrer un dossier de manière idempotente

**Files:**
- Create: `orchestrator/src/services/borealProductionService.ts`
- Create: `orchestrator/tests/borealProductionService.test.ts`
- Modify: `orchestrator/src/api/pgServer.ts`
- Modify: `orchestrator/tests/pgServerBots.test.ts`

**Step 1: Write the failing test**

Écrire des tests avec adaptateurs mémoire pour vérifier qu'un lancement manuel appelle Orvion une seule fois avec la même clé, republie le même reçu à un second appel et n'avance jamais sans la décision LINK de sélection. Vérifier qu'une indisponibilité Engine conserve le prompt et retourne `ENGINE_EN_ATTENTE`.

**Step 2: Run test to verify it fails**

Run: `npm test -- borealProductionService.test.ts`

Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Créer un service avec ports injectés `BorealEditorialPort`, `BorealLinkPort`, `BorealEnginePort` et un stockage mémoire seulement pour l'exécution locale. Ajouter des routes protégées : lecture du pilote, lancement manuel, décision de sujet et reprise Engine. Toutes vérifient un workspace autorisé et n'acceptent aucun secret du navigateur.

**Step 4: Run test to verify it passes**

Run: `npm test -- borealProductionService.test.ts pgServerBots.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add orchestrator/src/services/borealProductionService.ts orchestrator/tests/borealProductionService.test.ts orchestrator/src/api/pgServer.ts orchestrator/tests/pgServerBots.test.ts
git commit -m "feat: add idempotent Boreal pilot service"
```

### Task 3: Exposer les états et décisions dans l'interface Organigrad

**Files:**
- Create: `src/services/borealProductionService.ts`
- Create: `src/services/borealProductionService.test.ts`
- Create: `src/components/views/BorealProductionView.tsx`
- Create: `src/components/views/BorealProductionView.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Step 1: Write the failing test**

Tester que la vue présente le projet distinct `Boréal Production`, les sept étapes, le statut du visuel, les sujets sourcés et les actions humaines limitées à choisir un sujet ou valider le résultat. Vérifier que la vue n'affiche aucun jeton, URL privée ou secret.

**Step 2: Run test to verify it fails**

Run: `npm test -- BorealProductionView.test.tsx borealProductionService.test.ts`

Expected: FAIL because the modules do not exist.

**Step 3: Write minimal implementation**

Créer un client HTTP qui ne transmet que le jeton de session normal et une vue accessible. Ajouter l'entrée de navigation `Boréal Production`; afficher explicitement les états `Brouillon`, `En attente de ton choix`, `En attente d'Engine`, `À contrôler` et `Validé — prêt à publier`.

**Step 4: Run test to verify it passes**

Run: `npm test -- BorealProductionView.test.tsx borealProductionService.test.ts && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```powershell
git add src/services/borealProductionService.ts src/services/borealProductionService.test.ts src/components/views/BorealProductionView.tsx src/components/views/BorealProductionView.test.tsx src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat: add Boreal production pilot view"
```

### Task 4: Préparer l'activation contrôlée et les mandats pour Claude Code

**Files:**
- Create: `docs/claude/2026-09-15-boreal-production-migrations.md`
- Modify: `docs/CONTRAT-RPC-AUTORISATION-RESEAU.md` (only if it exists in this repository; otherwise link to the hub source)
- Test: `orchestrator/tests/botRpcSecurity.test.ts`

**Step 1: Write the failing test**

Étendre le test de sécurité avec le contrat attendu : une activation ne peut pas résulter d'une mutation générique de fiche ; le futur RPC propriétaire doit rendre un reçu incluant les vérifications de prompt, modèle, outils, sources et canal.

**Step 2: Run test to verify it fails**

Run: `npm test -- botRpcSecurity.test.ts`

Expected: FAIL until the expectation de contrat et l'adaptateur local sont ajoutés.

**Step 3: Write minimal implementation**

Ajouter seulement l'adaptateur local qui traite une absence de RPC comme `ACTIVATION_NON_DISPONIBLE`, sans forcer `enabled=true`. Rédiger le dossier Claude avec migrations additives séparées : tables de reçus d'activation, RPC owner-only, délégation Orvion bornée au `ProjectRef` et au board, liens dossier/étape/livrable/version, policies, tests SQL, rollback et grants explicites.

**Step 4: Run test to verify it passes**

Run: `npm test -- botRpcSecurity.test.ts borealProductionService.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add docs/claude/2026-09-15-boreal-production-migrations.md orchestrator/tests/botRpcSecurity.test.ts orchestrator/src
git commit -m "docs: specify Boreal controlled activation migrations"
```

### Task 5: Vérifier le parcours local sans raccordement externe

**Files:**
- Create: `orchestrator/tests/borealProduction.e2e.test.ts`
- Create: `docs/recettes/2026-09-15-boreal-production-local.md`

**Step 1: Write the failing test**

Écrire un test vertical avec des ports mémoire : démarrage manuel, veille avec sources, sélection LINK, article v1, contrôle, correction article v2 qui invalide le contrôle, Engine indisponible puis reprise, validation humaine et état final.

**Step 2: Run test to verify it fails**

Run: `npm test -- borealProduction.e2e.test.ts`

Expected: FAIL before the flows are wired together.

**Step 3: Write minimal implementation**

Compléter le câblage minimal et documenter la recette locale ; distinguer explicitement les preuves locales des validations préproduction qui exigent les migrations, LINK, Orvion et Engine réels.

**Step 4: Run test to verify it passes**

Run: `npm test -- borealProduction.e2e.test.ts && npm run check`

Expected: PASS.

**Step 5: Commit**

```powershell
git add orchestrator/tests/borealProduction.e2e.test.ts docs/recettes/2026-09-15-boreal-production-local.md
git commit -m "test: cover Boreal production local journey"
```

### Task 6: Revue locale et préparation de la recette de préproduction

**Files:**
- Modify: `docs/recettes/2026-09-15-boreal-production-local.md`

**Step 1: Run verification**

Run: `npm run check; Push-Location orchestrator; npm run check; Pop-Location`

Expected: all checks pass.

**Step 2: Inspect the diff**

Run: `git diff origin/master...HEAD --check; git status --short`

Expected: no whitespace errors and only pilot files changed.

**Step 3: Document the human validation gates**

Lister les prérequis avant toute création distante : migrations Claude revues/appliquées, activation explicitement reçue pour Éric/Design/Gardien, mandat Orvion, bridge LINK configuré serveur, Engine disponible, identité humaine membre. Préparer les cas de test et critères observables ; ne pas déployer ou pousser automatiquement.

**Step 4: Commit**

```powershell
git add docs/recettes/2026-09-15-boreal-production-local.md
git commit -m "docs: prepare Boreal preproduction validation"
```
