# Finalisation OrgChart Design

**Date:** 2026-03-11

## Objectif

Faire passer l'application d'une démo locale assemblée à une version cohérente et fiable, sans promettre une intégration Google Sheets réellement configurée si aucune URL distante n'est fournie.

## Périmètre validé

### Phase 1: Fiabilité fonctionnelle

- Corriger les incohérences de comptage des agents.
- Corriger les comportements cassés ou partiellement branchés dans l'organigramme.
- Corriger le nettoyage des données locales.

### Phase 2: Source de données explicite

- Rendre explicite le mode local par défaut.
- Clarifier l'UX de synchronisation pour qu'elle accepte un CSV local ou une URL distante.
- Supprimer l'ambiguïté "Google Sheets actif" quand l'application tourne sur le CSV embarqué.

### Phase 3: Finitions produit

- Supprimer les assets cassés visibles.
- Ne plus inventer des coordonnées de contact.
- Nettoyer les vues secondaires et la documentation projet.

## Décisions

- Garder `public/data.csv` comme source locale par défaut tant qu'aucune URL réelle n'est fournie.
- Ajouter une petite base de tests automatisés pour verrouiller les régressions sur les comportements corrigés.
- Corriger les éléments visuels les plus visibles sans lancer de refonte graphique lourde.

## Hors périmètre

- Connexion à une vraie feuille Google Sheets sans URL réelle.
- Refonte complète de l'architecture ou du design system.
- Nettoyage exhaustif de tous les artefacts historiques du dépôt.
