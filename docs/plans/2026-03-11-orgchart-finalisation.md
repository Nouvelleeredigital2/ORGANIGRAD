# OrgChart Finalisation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corriger les bugs visibles, rendre la source de données honnête et finaliser les éléments produit les plus incomplets.

**Architecture:** On introduit de petites fonctions utilitaires testables pour verrouiller les comportements métier, puis on applique des corrections ciblées dans l'UI React existante. La stratégie évite une refonte large et traite d'abord les incohérences fonctionnelles, ensuite l'UX de source de données, puis les finitions visibles.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, Tailwind CSS

---

### Task 1: Mettre en place les tests

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

**Step 1: Write the failing test**

Préparer les fichiers de configuration pour pouvoir écrire et exécuter des tests unitaires et composants.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: échec car le script de test et la configuration n'existent pas encore.

**Step 3: Write minimal implementation**

Ajouter Vitest, jsdom et le setup Testing Library.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: Vitest démarre et signale l'absence de tests ou exécute les premiers tests.

### Task 2: Verrouiller la phase 1 par les tests

**Files:**
- Create: `src/utils/dashboardStats.test.ts`
- Create: `src/utils/csvSource.test.ts`
- Create: `src/components/AppShellVisibility.test.tsx`

**Step 1: Write the failing test**

Écrire les tests rouges pour:
- le comptage exact des agents visibles
- la résolution honnête de la source CSV
- l'affichage du sous-header seulement sur la vue organigramme

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand`
Expected: échecs sur comportements non encore implémentés.

**Step 3: Write minimal implementation**

Créer les utilitaires nécessaires et brancher les composants.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand`
Expected: tests verts.

### Task 3: Implémenter la phase 1

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/OrgChartNode.tsx`
- Modify: `src/hooks/useOrgChartController.ts`
- Modify: `src/components/AgentCard.tsx`
- Create: `src/utils/dashboardStats.ts`

**Step 1: Write the failing test**

Compléter les tests de la task 2 si un comportement manque encore.

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand`

**Step 3: Write minimal implementation**

- Corriger le total d'agents du dashboard.
- Propager correctement `highlightedPath`.
- Activer réellement le mode édition au niveau des cartes.
- Utiliser le service de stockage pour le reset complet.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand`

### Task 4: Implémenter la phase 2

**Files:**
- Modify: `src/hooks/useGoogleSheets.ts`
- Modify: `src/hooks/useOrgChartController.ts`
- Modify: `src/components/views/SettingsView.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Create: `src/utils/csvSource.ts`

**Step 1: Write the failing test**

Étendre les tests de résolution de source si nécessaire.

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand`

**Step 3: Write minimal implementation**

- Rendre explicite le mode local par défaut.
- Renommer l'UX pour parler de source CSV locale ou distante.
- Afficher l'état de la source active sans ambiguïté.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand`

### Task 5: Implémenter la phase 3

**Files:**
- Modify: `src/components/layout/Topbar.tsx`
- Modify: `src/services/exportPdf.ts`
- Modify: `src/components/ContactModal.tsx`
- Modify: `README.md`
- Create: `public/assets/logo_lhay.svg`

**Step 1: Write the failing test**

Ajouter un test si un nouveau comportement fonctionnel est introduit. Sinon s'appuyer sur la vérification UI et build.

**Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand`

**Step 3: Write minimal implementation**

- Remplacer l'asset logo manquant par un asset vectoriel présent dans le repo.
- Retirer les faux fallback de contact.
- Documenter réellement le projet.

**Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand`

### Task 6: Vérification finale

**Files:**
- Modify: `none`

**Step 1: Run test suite**

Run: `npm test -- --runInBand`
Expected: PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Run browser verification**

Run: local browser automation against the Vite app
Expected: source state visible, logo present, vues cohérentes, aucun élément cassé évident
