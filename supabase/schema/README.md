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
