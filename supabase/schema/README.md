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
`pg_get_triggerdef`). Il **n'a pas été rejoué sur une base vierge** — cela
demanderait un projet Supabase jetable. Sa fidélité à l'existant est vérifiée ;
sa capacité à reconstruire de zéro est raisonnée, pas prouvée.

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
