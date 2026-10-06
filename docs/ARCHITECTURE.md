# Architecture — Organigrad

## Vue logique

```text
Navigateur React
  ├─ anon + JWT ───────────────► Supabase Auth/Postgres/RLS/Realtime
  ├─ session humaine / clé API ► Orchestrateur Fastify
  │                                ├─ machine à états
  │                                ├─ stores PostgreSQL
  │                                ├─ MCP JSON-RPC
  │                                ├─ SSE
  │                                ├─ workers de circuits optionnels
  │                                └─ intégrations externes
  └─ mode hors ligne ───────────► localStorage

Orchestrateur ─ service_role ───► PostgreSQL/Supabase
Orchestrateur ──────────────────► LINK / Synapse / Engine / Orvion / Slack / Edge Function email
```

## Frontend

La SPA est composée dans `src/App.tsx`. Les vues sont chargées paresseusement et l’URL encode la vue active. `WorkspaceProvider` et les hooks de session déterminent le workspace, l’utilisateur et les permissions. Les repositories choisissent Supabase ou un fallback local selon la configuration.

Le pont `useOrchestratorBridge` sonde l’orchestrateur, charge le graphe et ouvre un flux SSE. Ses états sont `local`, `connecting`, `connected`, `degraded` et `failed`. Lorsqu’un orchestrateur déployé est configuré mais indisponible, l’UI refuse désormais de simuler une exécution.

## Orchestrateur

`bootstrap.ts` choisit :

- PostgreSQL si `SUPABASE_DB_URL` existe ;
- mémoire seulement avec l’opt-in explicite `ORCHESTRATOR_ALLOW_MEMORY=1`.

En mode PostgreSQL, `pgServer.ts` authentifie les routes, résout le workspace et instancie les stores. Les mutations de statut passent par `stateMachine.ts`. `PgGraphStore.applyTransition` sérialise la ligne et écrit la transition dans une transaction.

## Trajets de données principaux

```text
Fiche RH
UI → agentRepo → Supabase/RLS → org_agents → relecture/realtime → UI

Nœud hybride connecté
UI → orchestrateur → validation/scopes → PgGraphStore → hybrid_nodes
   → node_transitions → SSE → UI

Circuit
UI → API circuits → PgCircuitStore → circuit_executions
   → worker/service externe → reçu/idempotence → étape suivante ou validation humaine

Email HITL
transition → Notifier → Edge Function notify-email → contrôle destinataire
   → réservation notifications → Resend → clôture du statut
```

## Asynchronisme

- SSE pour les transitions de nœuds.
- consommateur Synapse par polling, désactivé par défaut en production ;
- planificateur de circuits opt-in et borné à une liste de projets ;
- appels MCP, Engine et Orvion bornés et enregistrés avec empreintes/reçus selon le flux ;
- notifications sortantes Slack/email.

## Déploiement

- SPA : build Vite statique, Nginx ou Vercel.
- Orchestrateur : conteneur Node non-root, healthcheck `/healthz`.
- Base/Auth/Realtime/Edge Functions : Supabase.
- CI : frontend, E2E hermétiques, orchestrateur, contrôles PostgreSQL, hygiène ; E2E connectés uniquement sur déclenchement manuel.

## Références détaillées

- `docs/architecture/data-flow.md`
- `docs/architecture/concurrence-ecritures.md`
- `docs/architecture/actions-asynchrones.md`
- `docs/deployment.md`
- `orchestrator/README.md`

