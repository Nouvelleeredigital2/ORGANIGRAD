# API de l’orchestrateur

## Principes

- `/healthz` est public.
- Les routes `/api/*` et `/mcp` sont authentifiées en mode PostgreSQL, sauf SSE qui utilise un ticket court à usage unique.
- Les lectures/exécutions techniques utilisent des clés API et des scopes.
- Les décisions humaines utilisent un JWT Supabase vérifié et `X-Workspace-Id`.
- Les DTO de graphe n’exposent pas les prompts, configurations MCP, webhooks ou secrets.

## Familles de routes observées

| Famille | Capacités principales |
|---|---|
| Santé | `GET /healthz` |
| Graphe/nœuds | lecture du graphe, CRUD, run, run-flow, approve, reject, reset |
| Événements | création de ticket puis flux SSE |
| MCP | JSON-RPC `initialize`, `tools/list`, `tools/call` |
| Bots | CRUD, activation/désactivation, lien vers nœud, bundle Hermès |
| Projets | liste/CRUD, contexte, services cibles, missions, délégations |
| Projets privés | jetons et opérations bornées par feature flag |
| Circuits | CRUD, runs, décisions, contrôle, planification, occurrences et rattrapage |
| Livraison | remise d’une étape sous reçu/idempotence |
| Intégrations | import LINK, pont de décisions/identités, proxy voix |

## Codes attendus

- `400` : payload invalide.
- `401` : identité absente, invalide, expirée ou révoquée.
- `403` : scope/rôle insuffisant ou ressource hors workspace.
- `404` : ressource absente.
- `409` : transition illégale, conflit de version ou idempotence incompatible.
- `502/503` : dépendance externe ou gateway indisponible selon la route.

La liste exhaustive et les contrats se trouvent dans `orchestrator/src/api/`, `orchestrator/src/mcp/` et les tests API associés.

