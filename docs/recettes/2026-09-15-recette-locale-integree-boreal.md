# Recette locale intégrée — TEST FICTIF — Atelier Boréal (15 septembre 2026, soir)

> **Délestage du 15/09 (décision utilisateur 1C + 2C, contrat RPC §8.4) :** les opérations Orvion `visual_prompt:create` et `watch:create` + `subjects`, qui supposaient la migration Orvion « companions » écartée, ont été **retirées** de cette branche (client, livraison, route et tests restaurés depuis `master`). La recette intégrée est réalignée sur le circuit de passe 1 (six étapes, sans sélection) et les opérations Orvion installées (`visual_brief` → `version:create` + `kind:'visual_prompt'`). Reste en place, côté OrganiGrad seulement : la tolérance du domaine à un `brief` à côté du `visual_prompt` requis (jamais à sa place).

Périmètre : **local uniquement**. Aucun déploiement, aucune migration appliquée, aucune fusion, aucun push.
Branche : `boreal/organigrad-circuit-decision`, créée depuis `origin/feat/projects-frontend-20260913`
(qui contient les PR #30, #31 et #32 fusionnées le 15/09 entre 10:20 et 12:51 UTC).

## Ce que cette branche ajoute

| Brique | Fichier | Rôle |
| --- | --- | --- |
| Décision de circuit signée | `orchestrator/src/api/linkCircuitBridgeRoutes.ts` | `GET /api/link-bridge/circuit-runs` et `POST /api/link-bridge/circuit-runs/:runId/decisions`. Assertion `X-Synapse-Actor` (JWS EdDSA du hub, clé épinglée), rejeu refusé, `ProjectRef` canonique revalidé, appartenance et rôle relus dans `workspace_members`, exécution rattachée au projet affirmé, canal forcé à `link`, décision transmise à `PgCircuitStore.decide` (assignation humaine, idempotence). Le Gardien (bot) ne peut jamais valider : non-membre → 403, étape de contrôle → `APPROVAL_NOT_PENDING`. |
| Attente Engine durable | `orchestrator/src/orchestration/circuits.ts`, `pgCircuitStore.ts` | Statut `waiting_engine`, `waitForEngine`, `resumeEngine`, action de contrôle `retry_engine` (admin). Aucun visuel de remplacement ; le prompt reste chez Orvion (référence `visual_prompt`). |
| Génération Engine | `orchestrator/src/orchestration/engineGeneration.ts`, `api/circuitGenerationRoutes.ts` | `POST …/steps/:stepId/generate` (tentative durable `circuit_step_attempts` AVANT l'unique POST vers `ned-media-engine`, client existant `engineTaskClient`) et `POST …/generation-result` (référence du fichier → reçu `circuit_execution_receipts` → `completeStep`). Engine indisponible au préflight ⇒ `waiting_engine`, 0 soumission. |
| Configuration | `config/env.ts`, `api/bootstrap.ts`, `api/pgServer.ts`, `.env.example` | `ENGINE_GENERATION_ENABLED`, `ENGINE_BASE_URL`, `ENGINE_QUALIFIED_ORIGIN`, `ENGINE_API_KEY_FILE`, `ENGINE_ID` ; désactivé par défaut, exige `CIRCUIT_DELIVERY_ENABLED`. |

Tout reste **désactivé par défaut** (`LINK_BRIDGE_ENABLED=0`, `CIRCUIT_DELIVERY_ENABLED=false`, `ENGINE_GENERATION_ENABLED=false`).

## Tests frais (15/09, worktree `.worktrees/boreal-circuit-decision-20260915`)

Commandes, depuis `orchestrator/` : `npm run typecheck` puis `npx vitest run <fichiers>`.

| Fichier | Résultat |
| --- | --- |
| `tests/linkCircuitBridge.test.ts` | 9 tests réussis : liste par projet, décision relayée, double clic (reçu existant, `IDEMPOTENCY_CONFLICT`), non-membre / viewer / membre non assigné / Gardien refusés, étape de contrôle non décidable, assertions falsifiées/expirées/rejouées/non qualifiées, autre projet → 404, concurrence (un seul gagnant), version périmée et correction. |
| `tests/engineGeneration.test.ts` | 5 tests réussis : une seule tâche Engine sous tentative, rejeu sans soumission, conflit de prompt, règlement différé, indisponibilité → `waiting_engine` puis reprise admin, tâche échouée / résultat invalide sans reçu, refus hors étape, routes clé de service. |
| `tests/circuitDelivery.test.ts` | inchangé par rapport à `master` (12 tests). |
| `tests/circuitExecution.test.ts` | attente Engine et livrables d'accompagnement ajoutés, suite réussie. |
| `tests/env.test.ts` | configuration Engine ajoutée, suite réussie. |
| `tests/borealRecipe.integration.test.ts` | 2 tests réussis, circuit 1C (sans sélection) : double lancement, non-membre, Gardien limité au contrôle et refusé à la validation, Engine indisponible puis reprise, redémarrage du worker, correction humaine concurrente (un gagnant) avec article v2 et contrôle v1 remplacé, validation finale idempotente ; invariants : un dossier, deux tâches Engine pour deux versions, aucun contenu ni secret persisté, même `ProjectRef` dans les sept commandes Orvion ; réponse Orvion perdue (reçu incertain, aucun second POST). |
| Suite complète | voir le rapport du hub (`apps2026-hub/docs/relais-actuel-20260915/RECETTE-LOCALE-20260915-SOIR.md`). |

Ces tests emploient PGlite avec les **vraies migrations** (`circuits`, `circuit_attempts`, `project_service_delegations`, `circuit_execution_receipts`) et les **vrais clients** Orvion/Engine devant des serveurs simulés. Ils ne constituent ni une migration appliquée ni une recette inter-applications réelle.

## Écarts et limites connus

1. **Étape de sélection** : elle n'est pas couverte par cette branche ; la liste de livrables côté OrganiGrad (passe 2, route `deliver`) la rendra possible.
2. **Reprise Engine** : après `retry_engine`, la tentative est réservée sous la nouvelle version d'exécution (rien n'avait été soumis pendant l'attente : aucun doublon possible). Une tâche Engine **échouée** n'a pas de chemin de relance dédié : le dossier reste prêt, sans reçu ; une correction humaine reste le seul chemin.
3. **La délégation SQL (`project_service_delegation_command … check`) refuse une étape non prête ou une version périmée** : un rejeu de règlement après avancement rend `STALE_EXECUTION` (le reçu existe, l'état a avancé, aucun effet).
4. Le hub Synapse n'est pas appelé ici : l'assertion d'acteur est construite dans les tests selon le contrat de fil vérifié par `identityAssertions.ts` (même clé/typ/claims que `IdentityLinks.resolve` du hub, testé dans NED-AI-SYNAPSE #44).
