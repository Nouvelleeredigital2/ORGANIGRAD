# Service Organigramme Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter un import local `.csv/.xlsx` et afficher un organigramme distinct par service, sélectionnable dans la leftbar.

**Architecture:** La donnée importée est convertie vers un format interne unifié, puis un annuaire de services et des niveaux hiérarchiques par service sont dérivés via des utilitaires purs testés. L'UI React bascule ensuite de la vue arbre globale vers une vue "organigramme de service" pilotée par la sidebar.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, React Testing Library, PapaParse, SheetJS `xlsx`

---

### Task 1: Préparer les tests métier pour les imports et la hiérarchisation

**Files:**
- Create: `src/utils/importMapping.test.ts`
- Create: `src/utils/serviceDirectory.test.ts`
- Create: `src/utils/serviceHierarchy.test.ts`

**Step 1: Write the failing test**

Écrire des tests rouges pour:
- mapper les colonnes françaises du fichier réel vers `Agent`
- grouper les services par pôle avec une clé stable
- construire les niveaux hiérarchiques d'un service sans rattachement nominatif

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL avec imports manquants ou comportements non implémentés.

**Step 3: Write minimal implementation**

Créer les utilitaires minimaux qui font passer les tests.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS sur les nouveaux tests.

### Task 2: Ajouter l'import local CSV/XLSX

**Files:**
- Modify: `package.json`
- Create: `src/services/importService.ts`
- Create: `src/utils/importMapping.ts`
- Modify: `src/hooks/useOrgChartController.ts`

**Step 1: Write the failing test**

Étendre les tests de mapping si besoin pour couvrir le parsing des lignes importées.

**Step 2: Run test to verify it fails**

Run: `npm test`

**Step 3: Write minimal implementation**

- Ajouter `xlsx`
- lire les fichiers `.csv` via `ArrayBuffer` + détection simple d'encodage
- lire les fichiers `.xlsx` via première feuille
- exposer un handler d'import local dans le contrôleur

**Step 4: Run test to verify it passes**

Run: `npm test`

### Task 3: Ajouter la navigation par service en sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/hooks/useOrgChartController.ts`
- Create: `src/utils/serviceDirectory.ts`

**Step 1: Write the failing test**

Ajouter un test sur l'annuaire de services et, si utile, un test de rendu simple de la sidebar.

**Step 2: Run test to verify it fails**

Run: `npm test`

**Step 3: Write minimal implementation**

- calculer les services importés ou existants
- sélectionner un service actif
- afficher les services groupés par pôle dans la leftbar

**Step 4: Run test to verify it passes**

Run: `npm test`

### Task 4: Implémenter le rendu d'organigramme par service

**Files:**
- Create: `src/components/service/ServiceOrgChart.tsx`
- Create: `src/utils/serviceHierarchy.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/AgentCard.tsx`

**Step 1: Write the failing test**

Compléter les tests sur les niveaux hiérarchiques d'un service.

**Step 2: Run test to verify it fails**

Run: `npm test`

**Step 3: Write minimal implementation**

- dériver des rangs hiérarchiques par service
- afficher les cartes par niveaux successifs
- afficher un en-tête de service hors du graphe

**Step 4: Run test to verify it passes**

Run: `npm test`

### Task 5: Vérification finale

**Files:**
- Modify: `none`

**Step 1: Run tests**

Run: `npm test`
Expected: PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Run browser verification**

Run: local browser automation against the imported service view
Expected: import local visible, services listés en sidebar, organigramme d'un service rendu sans faux nœud
