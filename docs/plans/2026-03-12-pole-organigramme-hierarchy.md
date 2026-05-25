# Pole Organigramme Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer la navigation par service par une navigation par pole et reconstruire automatiquement les liens hierarchiques internes pour afficher un organigramme complet par pole.

**Architecture:** Le controleur central gere un pole selectionne au lieu d'un service. Une nouvelle utilite construit un arbre hierarchique par pole a partir de l'ordre source et du rang deduit des postes. L'UI reutilise le composant d'organigramme existant pour afficher un vrai arbre de personnes avec connecteurs.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, utilitaires metier locaux.

---

### Task 1: Tester l'annuaire des poles

**Files:**
- Create: `src/utils/poleDirectory.test.ts`
- Create: `src/utils/poleDirectory.ts`

**Step 1: Write the failing test**

Tester que l'annuaire regroupe les agents par `pole`, trie les poles et calcule leurs effectifs.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/poleDirectory.test.ts`

**Step 3: Write minimal implementation**

Creer `buildPoleDirectory(agents)`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/poleDirectory.test.ts`

### Task 2: Tester l'inference de hierarchie par pole

**Files:**
- Create: `src/utils/poleHierarchy.test.ts`
- Create: `src/utils/poleHierarchy.ts`

**Step 1: Write the failing test**

Ecrire un test RH qui verifie:
- Elina est racine
- Edith est enfant d'Elina
- Les recruteurs sont enfants d'Edith
- Nathalie est enfant d'Elina
- Les gestionnaires carriere paie sont enfants de Nathalie

**Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/poleHierarchy.test.ts`

**Step 3: Write minimal implementation**

Creer la logique de selection de racine, tete de branche et rattachement par ordre source.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/poleHierarchy.test.ts`

### Task 3: Basculer le controleur vers les poles

**Files:**
- Modify: `src/hooks/useOrgChartController.ts`
- Modify: `src/App.tsx`

**Step 1: Adapter l'etat**

Remplacer `selectedServiceKey` par `selectedPoleKey`, construire `poleDirectory`, `selectedPole`, `selectedPoleTree`, et un index `agent -> pole`.

**Step 2: Adapter les exports**

Exporter le pole courant en CSV et batcher les exports PDF sur tous les poles.

### Task 4: Adapter la leftbar et la vue organigramme

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/service/ServiceOrgChart.tsx` ou remplacer par une vue pole
- Modify: `src/components/AgentCard.tsx`
- Reuse: `src/components/OrgChart.tsx`

**Step 1: Sidebar**

Afficher les poles comme elements selectionnables.

**Step 2: Vue principale**

Afficher le pole comme titre de page puis rendre l'arbre du pole avec `OrgChart`.

### Task 5: Verification finale

**Files:**
- Test: `src/utils/poleDirectory.test.ts`
- Test: `src/utils/poleHierarchy.test.ts`

**Step 1: Run tests**

Run: `npm test`

**Step 2: Run linter**

Run: `npm run lint`

**Step 3: Run build**

Run: `npm run build`

**Step 4: Browser verification**

Verifier que `RESSOURCES HUMAINES` et `FAMILLE / SOCIAL` s'ouvrent comme organigrammes uniques et non comme services separes.
