# Schéma de référence

## Le problème que ce dossier résout

`supabase/migrations/` **ne reproduit pas la base de production**. Rejouées sur
une base vierge, ces migrations échouent : elles référencent des objets qu'elles
ne créent jamais.

Constat établi le 2026-08-03 par introspection du projet `xucmfdggetwxmpquqjvj`.
Objets présents en production et **absents de toute migration versionnée** :

| Objet | Type |
|---|---|
| `workspace_role` | enum — référencé par `rls.sql`, jamais créé |
| `profiles` | table |
| `workspace_invitations` | table |
| `workspace_members_view` | vue |
| `touch_updated_at()` | fonction — pourtant utilisée par deux triggers |
| `handle_new_user()` | fonction + trigger sur `auth.users` |
| `workspace_role_of()` | fonction — utilisée par 12 policies |
| `verify_workspace_api_key()` | fonction |
| `invite_workspace_member()` | fonction |
| `accept_workspace_invitation()` | fonction |

Différences de forme, en plus des absences :

- `workspace_members.role` est un **enum** `workspace_role` en production, alors
  que `init_schema.sql` le déclare en `text` avec un `check`.
- Les policies portent d'autres noms qu'attendu (`ws read members`,
  `hn insert writers`, `ak read admin`… au lieu de `workspaces_select`,
  `nodes_write`, `api_keys_admin`).
- `is_workspace_member` prend un paramètre nommé `ws`, pas `p_ws`.
- `has_workspace_role` n'existait pas avant le 2026-08-03 : `rls.sql`, bien que
  versionné, n'a jamais été appliqué tel quel.

Origine : la base a été construite en partie hors dépôt, puis rapprochée par
petites migrations de réconciliation. L'écart n'a jamais été refermé.

## Comment s'en servir

| Situation | Marche à suivre |
|---|---|
| **Environnement neuf** | Rejouer `baseline_2026-08-03.sql`, puis uniquement les migrations datées **après** le 2026-08-03. |
| **Production existante** | Ne rien rejouer. Le fichier est un miroir, il décrit ce qui tourne déjà. |
| **Nouvelle évolution** | Écrire une migration horodatée dans `migrations/` **et** reporter le changement ici. Sans les deux, la dérive reprend. |

Les migrations antérieures au 2026-08-03 sont conservées pour l'historique.
**Elles ne sont pas rejouables** et ne doivent pas servir à provisionner un
environnement.

## Ce qui n'est pas garanti

Le fichier de référence est un extrait fidèle obtenu par introspection
(`pg_get_functiondef`, `pg_get_constraintdef`, `pg_indexes`, `pg_policies`,
`pg_get_triggerdef`). Sa fidélité à l'existant est vérifiée.

**Sa capacité à reconstruire de zéro est désormais PROUVÉE — 21/09/2026.** Le
banc local ajouté par `supabase/config.toml` fournit la base jetable qui
manquait. Marche exacte suivie, sur une base vierge :

1. `baseline_2026-08-03.sql` → appliquée **sans une seule erreur** ;
2. les **30** migrations datées après le 2026-08-03 → **30 appliquées, 0 échec**.

Contrôle d'usage ensuite, refait le 21/09 avec **deux** comptes et non un seul :
chacun est créé par l'API d'administration, se connecte par mot de passe, et le
déclencheur `handle_new_user()` le rend **propriétaire** d'un espace. La base
porte alors deux espaces ; chaque compte **ne voit que le sien**, et sans jeton
la liste est vide.

Deux comptes, parce qu'avec un seul propriétaire une liste non vide ne prouve
rien : elle est compatible avec une absence totale de cloisonnement. C'est la
contre-épreuve qui donne sa valeur au contrôle, pas la lecture réussie.

Confirmé au passage : rejouer les migrations **sans** la base de référence
échoue bien, comme annoncé plus haut (`workspace_role_of` puis le type
`workspace_role` manquants). La marche à suivre ci-dessus n'est donc pas une
précaution, c'est la seule qui fonctionne.

Ne sont pas couverts : le schéma `auth` (géré par Supabase), les extensions
autres que `pgcrypto`, les Edge Functions, et la configuration Auth
(dont *Leaked Password Protection*, aujourd'hui désactivée).

## Report local du pilote personnel projets — 9 septembre 2026

`baseline_private_project_tokens_2026-09-09.sql` est le report exact de
`../migrations/20260909150000_private_project_tokens.sql`. C'est un complément
local, pas un relevé de production et pas un remplacement du miroir historique.
Il exige les tables projets de `20260909090010_projects_and_tasks.sql` et les
tables `auth.users` / `auth.sessions` détenues par Supabase. La migration ne crée
ni ne modifie les tables Auth. Ne pas inclure ce complément avant ces prérequis.
Le test PGlite `orchestrator/tests/privateProjects.test.ts` vérifie son identité
avec la migration et la réapplication de celle-ci. Le rôle SQL réellement chargé,
ses droits de lecture Auth, le schéma Auth et sa politique de session restent à
qualifier séparément avant toute activation. Aucun déploiement n'est autorisé ici.

## Report local des bots — 11 septembre 2026

`baseline_bot_profiles_2026-09-11.sql` est le complément additif exact de
`../migrations/20260911120000_bot_profiles.sql`, vérifié par
`orchestrator/tests/botRpcSecurity.test.ts`. Il suppose les workspaces, les
fonctions de rôles, `touch_updated_at`, les clés API et Auth déjà provisionnés.
Il ne remplace pas le miroir historique ; aucune migration ancienne ne doit
être rejouée. Ce report local n'atteste aucune application en production.

`baseline_bot_portraits_2026-09-11.sql` reporte exactement la migration additive
`20260911143000_bot_portraits.sql`, après le complément des bots. Le portrait
est une URL HTTPS facultative ; ce report ne signifie pas que la migration est
déployée. Les identifiants et prompts existants restent inchangés.

`baseline_bot_draft_activation_2026-09-11.sql` reporte la migration additive
`20260911162000_bot_draft_activation.sql`. Elle conserve les bots déjà activés,
crée les nouvelles fiches en brouillon et interdit leur activation sans futur
flux de vérification réel. Aucun contournement d'activation n'est prévu pour
les imports ; les identifiants historiques sont conservés. Ce report reste local.

`baseline_circuit_attempts_2026-09-11.sql` reporte exactement
`20260911165000_circuit_attempts.sql`. Ce protocole interne conserve uniquement
les empreintes des requêtes, les réservations, les jetons de fencing et les
reçus de tâches Engine. Il ne confère aucune autorisation d'exécution d'étape,
ne contacte pas Engine et n'avance pas les circuits. Aucun accès navigateur
ou REST n'est accordé ; le raccordement et la qualification restent à faire.

`baseline_circuits_2026-09-11.sql` et `baseline_circuit_schedules_2026-09-11.sql`
reportent les migrations locales `20260911150000_circuits.sql` et
`20260911160000_circuit_schedules.sql`. Ordre : projets → circuits → horaires.
Les tables sont fermées aux rôles navigateur. L'API circuits exige une session
humaine ; le planificateur préparé exige un grant de service dédié au projet.
Aucun worker n'est branché au démarrage et aucun circuit n'est activé par cette
préparation. Les miroirs ne constituent pas une preuve d'application distante.

## Relevé en production du 25 octobre 2026 (Lot 1 de l'audit du 22/10)

Relevé en lecture sur `xucmfdggetwxmpquqjvj`, objet par objet (`to_regclass`, `pg_proc`,
`pg_policies`), et non par nom de migration. Il remplace, pour les migrations ci-dessous,
la réserve « application distante non attestée » des sections précédentes.

### Migrations postérieures au 11/09 : toutes appliquées

| Fichier du dépôt | Version au registre | Objets vérifiés présents |
|---|---|---|
| `20260911120000_bot_profiles` | `20260912152254` | table `bot_profiles` |
| `20260911143000_bot_portraits` | `20260912152311` | `bot_profiles.avatar_url`, contrainte `bot_profiles_avatar_url_check` |
| `20260911150000_circuits` | `20260912152425` | tables `team_circuits`, `circuit_executions` |
| `20260911160000_circuit_schedules` | `20260912152437` | tables `circuit_schedule_cursors`, `circuit_schedule_occurrences`, `circuit_service_grants` |
| `20260911162000_bot_draft_activation` | `20260912152517` | `guard_bot_activation` |
| `20260911165000_circuit_attempts` | `20260912152530` | table `circuit_step_attempts` |
| `20260912100000_hybrid_nodes_presence` | **absente** | colonnes posées par `20260912115702` (voir plus bas) |
| `20260912115702_hybrid_nodes_presence` | `20260912115702` | `hybrid_nodes.presence`, `presence_observed_at`, `cadence` |
| `20260912152335_bot_portraits_correctif_conforme_depot` | `20260912152335` | contrainte `bot_profiles_avatar_url_check` |
| `20260914110000_project_service_delegations` | `20260914022552` | tables `project_service_delegations`, `project_service_delegation_audit` ; index `project_service_delegations_project*` ; fonctions `project_service_delegation_command`, `create_scoped_workspace_api_key` |
| `20260914150000_project_service_target_discovery` | `20260914022643` | `list_project_service_targets` |
| `20260914160000_project_service_missions` | `20260914022716` | `list_project_service_missions` |
| `20260914170000_bot_activation_workflow` | `20260914150653` | table `bot_activation_receipts` et son index ; `activate_verified_bot`, `bot_activation_status`, `deactivate_bot`, `guard_bot_activation` |
| `20260915120000_circuit_execution_receipts` | `20260915104415` | table `circuit_execution_receipts` et son index ; les quatre `circuit_receipt_*` |
| `20261004120000_synapse_suite_projects` | `20261004120000` | tables `synapse_project_links`, `synapse_project_grants` et leur index |
| `20261004160000_synapse_project_access` | `20261004160000` | `can_access_project` ; policies `projects_*`, `project_tasks_*` |
| `20261023100000_workspace_members_view_comember_read` | `20261023211634` | Lot 0, vérifié le 24/10 |
| `20261023100100_guard_invitation_role_owner` | `20261023211646` | Lot 0, vérifié le 24/10 |
| `20261025145236_index_cles_etrangeres_post_0812` | `20261025145236` | 16 index ; 0 clé étrangère non couverte |
| `20261025145248_liberer_reservations_notifications` | `20261025145248` | `release_stale_notification_reservations`, exécutable par `service_role` seul |

Les versions au registre diffèrent de celles des fichiers quand la migration a été
appliquée par le connecteur MCP, qui horodate lui-même. Les fichiers ne sont pas
renommés : ils restent l'historique d'intention (voir `../migrations/README.md`).

### Le doublon `hybrid_nodes_presence`

`20260912100000` et `20260912115702` ajoutent les trois mêmes colonnes, avec
`add column if not exists`. Seule la seconde est inscrite au registre ; la première n'a
jamais été appliquée sous son nom. Rejouées l'une après l'autre sur une base neuve, elles
ne se gênent pas.

**Procédure retenue : aucune écriture dans le registre.** Ce dépôt ne pousse pas ses
migrations par `supabase db push` (la production se reconstruit depuis la baseline, puis
les reports). Le registre diverge d'ailleurs bien au-delà de ce doublon : 33 versions
inscrites n'ont pas de fichier (historique antérieur au 03/08, applications directes),
28 fichiers ne sont pas inscrits sous leur version. Si un `db push` devenait un jour
l'outil de déploiement, il faudrait d'abord un réalignement complet et sauvegardé du
registre (`supabase migration repair`), décidé pour lui-même — pas une correction
ponctuelle de ce seul doublon.

### Report

`baseline_lot1_fondations_2026-10-25.sql` reporte les deux migrations du 25/10.
