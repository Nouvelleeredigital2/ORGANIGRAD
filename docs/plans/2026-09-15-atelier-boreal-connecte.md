# Atelier Boréal — plan actif de recette connectée

## Objectif

Faire fonctionner localement et préparer la recette préproduction d’un seul circuit sur `TEST FICTIF — Atelier Boréal` : veille, décision LINK, article, brief, Engine, contrôle et validation humaine. Boréal Production, Telegram et publication externe restent exclus.

## Réalisé localement

- Circuit de sept étapes, sans programmation ni publication.
- État `En attente d’Engine`, reprise idempotente et conservation du prompt.
- Commandes de pas minimales, avec `ProjectRef`, dossier, étape, version, acteur et clé d’idempotence.
- Pont serveur LINK vers OrganiGrad protégé par secret, sans identité ou canal fourni par le navigateur.
- Écran de préparation et route bornés au seul projet fictif Atelier Boréal.

## À terminer avant recette connectée

1. Claude qualifie et livre le mandat Orvion temporaire et la liaison d’identité LINK ↔ OrganiGrad demandés dans `docs/claude/`.
2. Revoir les migrations et les appliquer seulement à la préproduction ciblée.
3. Configurer les secrets de pont exclusivement dans les deux serveurs et qualifier Engine depuis le serveur.
4. Activer Éric, Design et Gardien par le RPC propriétaire après leurs vérifications ; ajouter la charte Identity Core du Gardien.
5. Exécuter la recette décrite dans `docs/recettes/2026-09-15-atelier-boreal-connecte-local.md`, conserver les reçus et révoquer le mandat si la recette est abandonnée.
6. Créer Boréal Production séparément seulement après recette réussie.
