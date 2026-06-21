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

## Session utilisateur (JWT) pour la validation humaine
`approve/reject/reset` exigent une **session humaine vérifiée**, pas une clé
technique :
- Le SPA envoie le JWT Supabase de l'utilisateur (`Authorization: Bearer eyJ…`) +
  l'en-tête `X-Workspace-Id` pour ces actions (`orchestratorService.humanHeaders`).
- L'orchestrateur (`auth.ts` + `userAuth.ts`) **vérifie le JWT** (signature HS256
  via `SUPABASE_JWT_SECRET`, expiration), résout le **rôle** dans
  `workspace_members`, et accorde les scopes via `scopesForRole` (owner/admin =
  tout ; member = lecture + run + human:* + reset ; viewer = lecture).
- Une clé technique (`ok_…`) suit la voie scopes et n'obtient jamais `human:*` →
  un agent ne peut pas approuver. `run` reste une action de clé technique.
- L'audit enregistre l'acteur réel (`user` avec son id, ou `api_key`).
