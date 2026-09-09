# Projets Organigrad — conception et plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter les vrais projets/tâches confirmés par Laurent, puis fournir leur synthèse autorisée à LINK.

**Architecture:** Organigrad est propriétaire des données persistantes Postgres. La SPA utilise sa session et la RLS, sans stockage de secours navigateur. L'orchestrateur expose une lecture API authentifiée de ces mêmes données ; LINK restera une projection et ne devient pas un second gestionnaire.

**Tech Stack:** React 19, TypeScript, Supabase/Postgres, Fastify, Vitest. Aucun Docker Desktop nécessaire.

## Décision et limites

Le 9 septembre, Laurent confirme explicitement de vrais projets et tâches dans Organigrad, et non une assimilation des nœuds d'orchestration à des tâches. L'approche additive conserve le graphe existant. Les alternatives écartées sont cette assimilation (statuts incompatibles) et le brouillon de la branche identity-project-context (localStorage uniquement, aucun partage réel).

Base relue : 4c333be. origin/master 6b7822b est déjà ancêtre ; la branche identity-project-context 1bba82b reste séparée. Modifications documentaires du checkout principal préservées.

## Contrat minimal de ce lot local

- `projects` : UUID id/workspace_id, name (1–160 caractères), description (0–500), archived_at nullable, created_at/updated_at, version entière positive.
- `project_tasks` : UUID id/workspace_id/project_id, title (1–200), description (0–2000), status `todo|running|blocked|done`, assignee_id nullable, due_date nullable, archived_at, dates et version.
- Les membres actuels du workspace lisent ses projets. Owner/admin/member écrivent ; viewer lit. Aucune visibilité extérieure implicite, aucun droit tiré de l'e-mail.
- Le responsable est un membre actuel du même workspace. Son départ ne bloque pas son retrait du workspace et ne doit pas autoriser un nouveau rattachement.
- Aucun déplacement d'objet vers un autre workspace/projet. Une écriture concurrente obsolète échoue ; pas d'écrasement silencieux. Chaque UPDATE transmet `version = version_lue + 1` et filtre `version = version_lue` ; la base refuse une version omise ou non suivante.
- Archivage/réactivation explicites, aucune suppression physique dans ce premier lot. Les tâches d'un projet archivé sont consultables mais non modifiables.
- Pas de seed, génération, émission bus ni conversion automatique des brouillons historiques.

## Ordre d'exécution

État détaillé et résultats : [preuves locales](2026-09-09-projets-preuves.md).
Les étapes 1 à 3 sont implémentées et validées localement ; l'étape 4 consigne
la finition navigateur et les commits. L'étape 5 n'est pas un raccordement livré.

### 1. Stockage et isolation

Créer une migration additive via le CLI Supabase, sans application distante. Ajouter un test SQL local (PGlite) qui échoue avant la migration : création/relecture, champs invalides, autre espace, viewer, retrait de rôle, archivage, version et responsable. Implémenter tables, contraintes, index, RLS et garde d'immuabilité ; rejouer ce test puis vérifier droits accordés. Ne pas présenter le schéma local comme appliqué en production.

### 2. Interface Organigrad

Créer `src/types/project.ts`, `src/services/projectRepo.ts`, leurs tests, `src/components/views/ProjectsView.tsx` et tests. Ajouter `projects` à la navigation/route existante et préserver les paramètres inconnus/invitation. Formulaires vides, liste/detail, changement de statut, responsable/échéance, archivage/restauration avec confirmation. Requêtes scopées et session obligatoire, erreur explicite sans fallback local. Ignorer les réponses d'une session/espace précédent, bloquer doubles soumissions. Tester d'abord puis implémenter ; rejouer types/tests/build.

### 3. Lecture API producteur

Créer un module de routes `/api/projects` et `/api/projects/:projectId/context` enregistré dans `pgServer.ts`, et tests Fastify. Session Organigrad obligatoire, appartenance actuelle vérifiée, aucune ancienne clé technique autorisée. Réponse limitée : projet, compteurs réels des tâches non archivées, membres actuels du workspace (libellé explicite), activité réelle bornée. Champs privés des profils et secrets absents. Sans schéma : indisponibilité explicite. Ne pas appeler cela un raccordement LINK terminé.

### 4. Assemblage et preuve

Relire changements SQL/API/SPA, exécuter suites locales et builds, vérifier séparément les modifications du checkout principal. Documenter nombres exacts, limites, versions et nettoyage ; commits distincts pour stockage et application. Pas de push automatique ni migration distante.

### 5. Raccordement restant après ce socle

Créer la délégation personnelle Organigrad qualifiée, puis la liaison explicite (organisation/espace LINK → workspace/projet Organigrad). L'endpoint LINK `/api/spaces/:spaceId/context` prévu par le plan nécessite cette liaison et ne doit pas être contourné par un identifiant fourni librement. Adapter API/MCP sur la même autorisation, tester les deux sessions réelles et le refus des tiers. Ce lot n'étend pas encore les contrats Synapse 1.6.0-pilot.1.

## Activation distante

Inventorier cible/base/migrations réellement présentes ; accord regroupé sur SQL exact, versions/services et données TEST-SYNAPSE. Garder V4 et le pilote mémoire indépendants. Validation locale ≠ livraison ≠ validation en ligne.

## Documentation consultée

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Journal Supabase](https://supabase.com/changelog), consulté le 9 septembre 2026 : aucun changement moteur ou migration plateforme inclus dans ce lot.
