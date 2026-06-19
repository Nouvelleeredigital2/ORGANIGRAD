# Modèle d'autorisation

Deux identités distinctes accèdent au système.

## 1. Utilisateurs humains (SPA)
- Authentifiés par **session Supabase (JWT)**.
- Cloisonnés par **RLS** Postgres : chaque table restreint l'accès via
  `workspace_members` (`auth.uid()`), rôles `owner > admin > member > viewer`.
- Lecture pour tout membre ; écriture des nœuds pour `member+` ; gestion des clés
  et des membres pour `admin+` ; suppression du workspace pour `owner`.

## 2. Clés API techniques (agents / services → orchestrateur)
- `Authorization: Bearer ok_<hex>` ; stockées **hashées** (SHA-256), jamais en clair.
- Métadonnées : `key_prefix`, `scopes`, `created_by`, `created_at`, `last_used_at`,
  `expires_at`, `revoked_at`.
- La valeur complète n'est visible **qu'à la création** (RPC `create_workspace_api_key`).

### Scopes
| Scope | Action |
|---|---|
| `graph:read`, `node:read`, `execution:read` | lecture |
| `node:run` | exécuter un nœud |
| `human:approve`, `human:reject`, `node:reset` | validation **humaine** |
| `workspace:admin` | administration |

**Règle d'or** : une clé technique ne reçoit **jamais** `human:*`, `node:reset` ni
`workspace:admin` (la RPC refuse / n'assigne que les scopes techniques par défaut).
→ un agent ne peut pas contourner la validation humaine.

## Enforcement
- Orchestrateur : `orchestrator/src/api/scopes.ts` (`assertScope`) appelé par chaque
  route REST (`pgServer.ts`) et chaque outil MCP (`mcpServer.ts`). Scope manquant → 403.
- Clé expirée / révoquée → 401. Appartenance au workspace vérifiée à chaque opération.
- Service_role (orchestrateur) contourne RLS mais reste cloisonné par les clauses
  `where workspace_id = …` explicites (défense en profondeur).

## Mapping erreurs → HTTP
`MISSING_BEARER_TOKEN`/`INVALID_OR_REVOKED_KEY`/`EXPIRED_KEY` → 401 ·
`INSUFFICIENT_SCOPE` → 403 · `NODE_NOT_FOUND` → 404 · `ILLEGAL_TRANSITION` → 409.

## Reste à faire
Vérification forte par **session utilisateur (JWT Supabase)** côté orchestrateur
pour `approve/reject` (aujourd'hui protégé par scopes) — cf. rapport final.
