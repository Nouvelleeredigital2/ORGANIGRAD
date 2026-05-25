# Organigrad — Orchestrator

Service long-running TypeScript/Node — la **source de vérité** de l'état des `HybridNode` du graphe. Piloté par MCP (côté agents) et REST + SSE (côté SPA Organigrad). Messagerie en sortie seule.

## Plans séparés (non négociable)

- **Plan de contrôle** — toutes les transitions passent par l'API REST + le client MCP. Structuré, fiable, authoritatif.
- **Plan d'observation** — la messagerie (Slack/Telegram) reçoit un journal des transitions. Elle ne déclenche **jamais** de transition. Aucun listener entrant.

## Architecture

```
orchestrator/
└── src/
    ├── domain/         types.ts (HybridNode) · stateMachine.ts (transitions)
    ├── state/          graphStore.ts (source de vérité in-memory)
    ├── mcp/            mcpClient.ts (client MCP HTTP)
    ├── orchestration/  engine.ts (moteur + règles HITL)
    ├── api/            server.ts · routes.ts · bootstrap.ts
    └── observability/  notifier.ts (Slack/Telegram, sortie seule)
```

## API REST

| Méthode | Route | Codes |
|---|---|---|
| `GET`  | `/api/graph` | 200 |
| `POST` | `/api/nodes/:id/run` | 200, 404, 409 |
| `POST` | `/api/nodes/:id/approve` | 200, 404, 409 |
| `POST` | `/api/nodes/:id/reject` (body `{ feedback }`) | 200, 404, 409 |
| `POST` | `/api/nodes/:id/reset` | 200, 404, 409 |
| `GET`  | `/api/events` | 200 (text/event-stream) |

## Transport MCP (JSON-RPC 2.0)

Route unique `POST /mcp` — Streamable HTTP. Auth identique aux routes `/api/*`
(Bearer API key workspace). Méthodes supportées :

- `initialize` · `notifications/initialized` · `ping`
- `tools/list` — énumère les 5 outils
- `tools/call` — invoque par `name` + `arguments`

Outils exposés :

| Outil | Description |
|---|---|
| `list_nodes` | Snapshot du graphe |
| `run_node` | Lance un nœud non-humain |
| `approve_node` | Approuve une attente HITL (HUMAN → IDLE) |
| `reject_node` | Rejette avec feedback (→ ERROR) |
| `reset_node` | Reset d'un nœud en ERROR |

Connexion depuis Claude Code :

```bash
claude mcp add --transport http organigrad \
  https://orchestrator.example.com/mcp \
  --header "Authorization: Bearer ok_xxxxxxxxxxxxxxxx"
```

Le `GET /api/events` émet des SSE typés `NODE_STATUS_CHANGED` à chaque transition et un heartbeat toutes les 15 s.

## Machine à états

Transitions légales — toute autre lève `IllegalTransitionError` (HTTP 409) :

```
IDLE                    → EXECUTING
EXECUTING               → CONTROL_PENDING_IA | WAITING_HUMAN_APPROVAL | ERROR
CONTROL_PENDING_IA      → WAITING_HUMAN_APPROVAL | ERROR
WAITING_HUMAN_APPROVAL  → IDLE  (approve) | ERROR (reject + feedback)
ERROR                   → IDLE  (reset après correction)
```

Règle d'or : `WAITING_HUMAN_APPROVAL` ne se quitte **que** par `approve`/`reject` via l'API REST.

## Démarrage

```bash
cd orchestrator
npm install
npm run dev          # tsx watch → http://localhost:3001
# ou
npm run build && npm start
```

Variables d'environnement optionnelles :

- `PORT` — port d'écoute (3001 par défaut)
- `SLACK_VALIDATIONS` — webhook `#validations` (ping HITL)
- `SLACK_FLUX` — webhook `#flux-agents` (journal vivant)
- `SLACK_DIRECTOR`, `EMAIL_DIRECTOR` — canaux personnels du gatekeeper humain
- `MCP_REDACTEUR`, `MCP_BRAND_GUARD`, `MCP_FACT_CHECKER` — endpoints MCP des agents

## Tests

```bash
npm test
```

Couverture actuelle (TDD strict, chaque module a son fichier de tests rouge → vert) :

- `stateMachine` — transitions légales/illégales + auto-boucle interdite
- `graphStore` — chargement, lecture, mutation via machine à états, événements
- `mcpClient` — appels HTTP, parsing par type de bloc, timeouts, échecs
- `engine` — flux Campagne Marketing, HITL, approve/reject/reset
- `api` — toutes les routes + 404/409 + SSE `NODE_STATUS_CHANGED`
- `notifier` — `#validations` vs `#flux-agents`, aucun listener entrant
