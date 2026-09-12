# Matrice de reprise — équipes et circuits partagés

Relevé local du **11 septembre 2026**. Lecture des fichiers, journaux Git et
références `origin/*` déjà disponibles sur ce poste, **sans fetch, réseau,
introspection distante ou modification de service**. Les références distantes
Git sont donc des instantanés locaux. Les déploiements cités sont des preuves
documentaires datées, pas une certification de leur état actuel.

## Applications et sources à rapprocher

| Application | Base et checkout du chantier | Projets déjà fusionnés : preuve Git locale | Contrat consommé dans les sources lues | SQL nouveau / historique à ne pas rejouer | Version déployée : dernier relevé daté | Dépendances bloquantes |
|---|---|---|---|---|---|---|
| **OrganiGrad** | `.worktrees/equipes-circuits-20260911`, base `bb31375`, branche `feat/equipes-circuits-20260911`. La racine reste sur `e2e/organigrad-2026-09-03` à `4c333be` ; ce n'est pas la base du chantier. | `origin/master`: `2c109b7` fusionne **#23**, projets et correctifs ; `c1eda42` en est un ancêtre vérifié. `bb31375` intègre **#24**, Bots. | Frontend et backend de ce worktree : tarball local **1.6.0-pilot.6**. Le manifeste backend de la base `bb31375` consommait encore **1.1.1** : le changement de dépendance est une évolution locale réelle. | Projets `20260909090010` et jetons `20260909150000` rapportés appliqués : **ne pas rejouer**. Bots `20260911120000` : code fusionné, application distante non vérifiée. Nouvelles migrations du chantier : portraits `143000`, circuits `150000`, schedules `160000`, brouillons `162000`, tentatives `165000`, toutes datées `20260911`, non appliquées par ce chantier. | Le 06/09 : frontend sur `srv1915630`, `/opt/organigrad-front/dist`, bundle `index-CBOIH-W8.js`. Le relevé du 09/09 décrit des **images candidates**, pas leur livraison. Parité avec `bb31375` ou ce worktree : **non vérifiée**. | Requalifier Supabase `xucmfdggetwxmpquqjvj`, schéma, rôle SQL, workspace et configuration publique. Le dernier refus du connecteur est consigné dans le suivi. Activation réelle des bots, grants d'exécution d'étape, liaisons de service et worker restent distincts des modules locaux. |
| **LINK** | `.worktrees/equipes-circuits-20260911`, base `72c5cd9` ; racine `main` à `ec1996b`, plus ancienne. | `origin/main` `72c5cd9` fusionne **#47**. `2b0b0ce` apporte l'association personnelle Synapse ; `f3022bd` vérifie sessions et défis de liaison ; `e546527` teste attribution persistée et mobile. | Worktree courant : tarball local **1.6.0-pilot.6** ; l'association personnelle conserve son caractère de lecture et de session. | `db/migrations/0053_private_memory_proposals.sql`, `0054_project_sessions.sql` et `pg_cron` rapportés appliqués au pilote : **ne pas rejouer**. Nouveau `0055_conversation_project_refs.sql` : préparé localement, non livré. | Preuve du **09/09 à 02:00 UTC** : `link-link:20260909-sans-demo-df65577`, révision `df65577c3f4d5c18dc773e84b90ebd1bfe25c210`, conteneur `link-link-1` sur `srv1915630`. Ce n'est pas une preuve de livraison de #47. | Association de conversation au projet locale ; projection des bots, commandes de circuit, autorisation interapplications et équivalence Telegram à raccorder. Ne pas transmettre un JWT LINK comme JWT OrganiGrad. Cible pilote documentée : `knsqgxhnuhohjkgxegys`, à requalifier. |
| **Atelier Orvion** | `.claude/worktrees/equipes-circuits-20260911`, base `af779680` (`origin/master`, fusion #77 sécurité). Racine `fix/modeles-ollama-servis` à `c7b0b2c6`, modifications d'une autre session. | La branche historique `origin/codex/identity-project-context` à `b1276dbd` n'est ancêtre ni de `origin/master` ni de `origin/main` dans les références locales. **Fusion de ce chantier projets non établie** ; ne pas la supposer à partir des tableaux existants. | Schéma HTTP local Zod dans `editorial.routes.ts`, mêmes champs de référence projet ; backend CommonJS et paquet `@shared` CommonJS. Aucun import direct du paquet ESM `@apps2026/contracts` dans cette route. Compatibilité à garder testée, pas identité de paquet présumée. | Nouveau `20260911160000_editorial_dossiers.sql`, schéma `notebookpro`, préparé localement. Ne pas rejouer la baseline ni les migrations de récupération déjà rapportées en base par le commit `c7b0b2c6`. Historique réel à confronter avant ajout. | Relevé **07/09** : `orvion-server-1`, `orvion-redis-1` sur `srv1915630`. Révision applicative et déploiement des dossiers éditoriaux : **non vérifiés**. | API actuelle humaine avec permissions du tableau ; liaison propriétaire immuable ne prouve pas l'accès au projet distant. Il manque l'autorisation de service, le rapprochement projet/tableau et le raccordement depuis une exécution. Cible documentée `zeszahyeslszegumuyde` à qualifier. |
| **Synapse** | **Ne pas utiliser la racine `89ad3d7` comme base pilote.** Pilote `.worktrees/connection-secrets-20260908` à `49d78dd`. Chantier parallèle `.worktrees/dossiers-integration-20260911` à `68e7d07`, qui descend bien de `49d78dd`. | `origin/main` `13d7eaf` contient **#8** (`4450916`, identité/projet) et **#37** (`5c12d16`, filtre strict projet). Mais `49d78dd` **n'est pas ancêtre de `origin/main`** : les compléments privés du pilote ne sont pas assimilables à main. Le chantier dossiers contient ensuite `20c5e7e`, `fdba8ee`, `68e7d07`. | Pilote `connection-secrets` : **1.6.0-pilot.4**. Chantier parallèle dossiers : **1.6.0-dossiers.1**. OrganiGrad/LINK courants : **pilot.6**. Ces variantes ne sont pas déclarées interchangeables. | `backend/sql/private-session-verifier.sql` rapporté appliqué sur `owekpppiqacsqagkiwuf` : **ne pas rejouer**. Aucun SQL Synapse créé par ce sous-lot. Éventuels ajouts du chantier parallèle à inventorier avec son responsable avant intégration. | Relevé **07/09** : `synapse-backend` port conteneur 4400 et `synapse-front` sur `srv1915630`. Le document du **09/09** décrit candidat backend `pilot-20260909-49d78dd`, sans attester son remplacement en service. | Rapprocher la branche pilote et le chantier dossiers, les contrats, l'état des sessions, le coffre persistant et les signatures. Les limites Auth doivent être qualifiées, jamais inventées. Autorisations de service par projet et transport des commandes du circuit encore à raccorder. |
| **Engine** | `ned-media-engine`, racine `e2e/ned-media-engine-2026-09-03` à `5de71d8`, sur base `83c1df6` ; autre worktree `console-operational-audit` à `13def6c`. Ce chantier ne modifie pas Engine. | Aucun chantier de projet partagé fusionné identifié. `ee00230` apporte les clés API par application (#14), ce qui ne prouve pas une autorisation par projet. | API réelle `/api/v1/engines`, POST `/api/v1/jobs` → 202, GET job et résultats, contrats internes **@ned/contracts / @ned/shared-types**. Adaptateur OrganiGrad limité à `generate-image`, moteur explicite, résultats référencés ; aucun fournisseur alternatif. | Aucun SQL Engine de ce chantier. Prisma/SQLite et migrations propres au service : aucun `prisma:migrate` ou seed lancé. | La note d'exploitation du **07/09** ne l'attribue à **aucun VPS**. Le pont utilise historiquement hermes-vps par défaut : cela ne qualifie pas sa cible. Version, origine HTTPS et disponibilité GPU actuelles : **non vérifiées**. | Qualifier consommateur, pont réseau, origine et clé serveur, moteur disponible. Adaptateur et tentatives persistantes isolés, non branchés au worker. Aucun droit de génération déduit de `schedule:create`. |

## Les trois instances Hermès sont distinctes

| Instance | Base/contrat observable | Livraison ou fonctionnement documenté | SQL et état du chantier projets | Blocage avant bascule |
|---|---|---|---|---|
| **srv1915630 — apps2026-prod** | LINK consomme `http://hermes-gateway:8642/v1` ; données `/opt/hermes/data` montées `/opt/data`. Contrat de transport Hermès, pas le paquet de circuits supposé présent. | Relevé 07/09 : image `hvps-hermes-agent:migre-20260906`. Mise à jour LINK du 09/09 : Hermès et job runner inchangés. Révision du code actuellement exécuté non requalifiée. | Aucun SQL ni déploiement Hermès de ce chantier. Le rapport du 11/09 indique cinq veilles et l'amorce Éric actifs aussi sur cette instance. | Identifier l'unique propriétaire des programmations avec l'autre instance. La présence du transport LINK ne signifie ni registre dynamique OrganiGrad ni accès de service projet. |
| **srv1017182 — hermes-vps** | Source personas : `apps2026-hub/.worktrees/personas-llm-20260910`, `e5cede0`, précédé de `dcffd77` activation et `d0df9f1` contrats éditoriaux. Lecteur historique à 14 fichiers. | Rapport **11/09, 00:39:50 UTC** : 14 profils actifs dans `hermes-gateway`, `personas-chat.service`, PID 1731 à ce relevé. Réception ultérieure : 14 réponses actives et 14 candidates ; aucun nouveau prompt installé lors de cette réception. | Aucun SQL de ce chantier. Ancien pipeline Synapse non livré : rapport 11/09, validation 401, renouvellement `refresh_token_already_used`, workspace `ws_demo` non qualifié. | Même cinq veilles/amorce Éric que sur prod selon rapport 11/09. Préserver tokens, historiques et offsets ; ne pas arrêter ce lecteur avant remplacement qualifié. Les prompts de ce chantier et le registre dynamique ne sont pas déployés. |
| **srv698787 — snapbooth-vps** | Troisième Hermès recensé ; source, image, modèle et consommateurs précis **non vérifiés ici**. | Relevé 07/09 : instance distincte présente ; minuteur CI encore actif. Aucune nouvelle sonde de cette instance dans ce sous-lot documentaire. | Aucun SQL ni bascule de ce chantier. Ne pas lui attribuer les fichiers ou comptes de l'une des deux autres instances. | Identifier explicitement son propriétaire, ses tâches et ses consommateurs avant arbitrage. Le problème CI de cette machine ne constitue pas une preuve sur l'état de ses personas. |

## Preuves et règles de reprise

- **Git local** : `git worktree list`, `git log origin/master` / `origin/main`,
  `git merge-base --is-ancestor`. Les tests d'ascendance cités ont renvoyé 0 pour
  `c1eda42 → OrganiGrad origin/master` et `49d78dd → Synapse 68e7d07` ; 1 pour
  `49d78dd → Synapse origin/main` et `b1276dbd → Orvion origin/master/main`.
- **Infrastructure** : `apps2026-hub/ETAT_INFRA_ACTUEL.md` (relevé 07/09,
  coordination documentaire 10/09), à la racine commune des applications.
- **Pilote** : `HARNESS-E2E-CODEX/docs/plans/2026-09-09-livraison-reseau-etat.md`
  (révision 10/09, preuves distantes 09/09). Ses six opérations SQL sont
  rapportées appliquées par Claude ; cette matrice ne les réatteste pas.
- **Déploiements** : `LINK/DEPLOIEMENT-ACTUEL-20260909.md`,
  `ORGANIGRAD/docs/etat-production-2026-09-06.md`, et dans le worktree personas
  `hermes-veille/deployment/DEPLOIEMENT-20260911.md` puis
  `retest-20260911-134918/RESULTATS.md`.
- **Contrats actuels** : manifestes des worktrees nommés ; pour Orvion,
  `docs/EDITORIAL-CIRCUITS.md` et le schéma de route ; pour Engine,
  `CLAUDE.md`, routes jobs/engines, `jobService.ts` et `resolveRouting`.

Une fusion Git, une image candidate et un service effectivement vérifié sont
trois états différents. Avant mutation distante, requalifier la cible exacte,
les montages et l'historique SQL ; n'appliquer que les ajouts manquants. Aucun
échec de connexion n'autorise à substituer une autre base. Les liaisons
personnelles en lecture seule ne deviennent pas des autorisations de service.

Cette matrice ne clôture pas le lot 0 : les divergences entre sources pilotes,
contrats et services doivent encore être rapprochées par une qualification
connectée. Elle donne la base locale et les inconnues explicites pour le faire.

## Consolidation postérieure au relevé initial

Le contrat `1.6.0-teams.1` réunit désormais `pilot.6` (circuits) et le chantier
`dossiers.1` (ScopeContext). 201 tests passent. Les nouveaux worktrees OrganiGrad,
LINK et Synapse consomment exactement ce tarball ; les autres sessions ne sont
pas modifiées. PR contrats #10, commit de consolidation 1ea2d96.
Empreinte SHA-256 vérifiée identique dans les quatre copies vendored (frontend
et backend OrganiGrad, LINK, Synapse) :
`ba54b8814eb19d0e627266100ea2bcc1de00839054807258b26c36d90523e1db`.

Synapse : nouveau worktree `.worktrees/equipes-circuits-20260911` sur 68e7d07,
correctif 6377dbd. La branche distante `review/dossiers-base-20260911` conserve
ce snapshot pour la PR empilée #39. Cette création de branche ne fusionne pas
le pilote dans main et ne déploie aucun service.

Les 14 fiches sources conservent 14 UUID et 14 runtimeId distincts : cinq
veilleurs, sept rédacteurs, un designer et un gardien. `profiles.json` est
inchangé ; seule la compilation de relecture a été régénérée avec les règles
de canal et validation mises à jour. Ce comptage n'est pas une évaluation LLM.

Nouvelle lecture Supabase après ouverture des PR : `get_project_url` pour
`xucmfdggetwxmpquqjvj` renvoie encore « You do not have permission to perform
this action ». Aucune référence retournée, aucune mutation distante autorisée
par cette tentative. Restauration des droits du compte connecté demandée.
