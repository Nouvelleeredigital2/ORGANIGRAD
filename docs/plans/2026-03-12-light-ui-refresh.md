# Light UI Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Basculer l'application vers un mode clair unique plus harmonieux, moderne et epure, en supprimant le mode sombre de l'interface.

**Architecture:** La refonte repose sur trois couches: styles globaux, shell de navigation, puis composants metier. La logique fonctionnelle reste stable, mais les controles lies au theme sombre sont retires de l'UX pour simplifier le produit.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite.

---

### Task 1: Refaire le theme global

**Files:**
- Modify: `src/index.css`
- Modify: `src/AppShell.tsx`

**Step 1:** Ajouter un fond clair premium et adoucir la texture globale.

**Step 2:** Neutraliser les styles sombres residuels.

### Task 2: Refaire la navigation

**Files:**
- Modify: `src/components/layout/Topbar.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1:** Retirer le toggle de theme.

**Step 2:** Adoucir les boutons, panneaux et accents.

### Task 3: Refaire les ecrans principaux

**Files:**
- Modify: `src/components/pole/PoleOrgChartView.tsx`
- Modify: `src/components/AgentCard.tsx`
- Modify: `src/components/views/DashboardView.tsx`
- Modify: `src/components/views/SettingsView.tsx`

**Step 1:** Allegement visuel des cartes et blocs.

**Step 2:** Suppression de la section `Apparence` dans les parametres.

### Task 4: Verification

**Files:**
- Verify: interface locale

**Step 1:** Run `npm run lint`

**Step 2:** Run `npm run build`

**Step 3:** Verifier en navigateur les vues organigramme, dashboard et parametres.
