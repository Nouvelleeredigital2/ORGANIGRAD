# Organigrad

Plateforme d'**orchestration hybride Humain · IA · MCP** : un organigramme exécutable
où chaque nœud est un humain (garant/validation), un agent IA, ou un logiciel via MCP.
Le flux avance d'un nœud à l'autre sous contrôle d'une machine à états, avec
validation humaine (HITL), notifications, et audit.

- **SPA** (`/`, `src/`) : React 19 + Vite + Tailwind, données via Supabase.
- **Orchestrateur** (`orchestrator/`) : Node + Fastify + `postgres.js`, moteur d'exécution + MCP.
- **Supabase** : Postgres (source de vérité persistante), Auth, Edge Functions, RLS.

---

## 1. Prérequis

- Node.js ≥ 20
- npm ≥ 10
- Un projet Supabase (Postgres 15+) — pour le mode connecté
- (Optionnel) Supabase CLI pour les migrations

## 2. Installation

```bash
# SPA (racine)
npm install

# Orchestrateur
cd orchestrator && npm install
```

## 3. Variables d'environnement

Ne jamais committer de `.env` rempli (seuls `.env.example` / `.env.test` sont versionnés).

**SPA** — copier `.env.example` → `.env.local` :

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé publishable (anon) |
| `VITE_ORCHESTRATOR_URL` | URL de l'orchestrateur (optionnel ; sans elle → mode brouillon) |

**Orchestrateur** — copier `orchestrator/.env.example` → `orchestrator/.env` :

| Variable | Rôle |
|---|---|
| `PORT` | Port HTTP (défaut 3001) |
| `SUPABASE_DB_URL` | Connection string Postgres (service_role). Si absent → mode in-memory |
| `SUPABASE_SERVICE_ROLE_KEY` | Appel de l'Edge Function `notify-email` (secret) |
| `EMAIL_EDGE_FUNCTION_URL` | URL de la fonction `notify-email` |
| `SLACK_VALIDATIONS`, `SLACK_FLUX` | Webhooks Slack (secrets) |
| `APP_URL` | URL publique de la SPA (deep-links notifications) |
| `CORS_ALLOWED_ORIGINS` | Allowlist CORS séparée par virgules (jamais `*`) |

## 4. Lancement — frontend

```bash
npm run dev       # dev (Vite)
npm run build     # build de prod (tsc -b && vite build)
npm run preview   # prévisualisation du build
```

## 5. Lancement — orchestrateur

```bash
cd orchestrator
npm run dev       # tsx watch (mode in-memory si SUPABASE_DB_URL absent)
npm run build     # tsc
npm start         # node dist/api/bootstrap.js
```

Sans `SUPABASE_DB_URL`, l'orchestrateur tourne **in-memory** (dev/tests, sans auth).
Avec, il passe en **mode Postgres + clés API** (production).

## 6. PostgreSQL / Supabase

La base est la **source de vérité persistante**. L'orchestrateur s'y connecte en
`service_role` (contourne RLS) tout en restant cloisonné par des clauses
`where workspace_id = …` explicites. La SPA s'y connecte en anon + JWT utilisateur,
cloisonnée par **RLS**.

## 7. Migrations

Migrations versionnées dans `supabase/migrations/` :

- `20260617120000_init_schema.sql` — schéma complet (déploiement *from scratch*)
- `20260617130000_rls.sql` — politiques RLS (from scratch)
- `20260617140000_notifications_idempotency.sql` — idempotence notifications
- `20260618000000_reconcile_p2_p5_*.sql` — **réconciliation** appliquée à la base
  de prod existante (déjà durcie) : ajoute `scopes`/`expires_at`, `idempotency_key`,
  et met la RPC de clé API à jour, sans dupliquer les policies existantes.

```bash
supabase link --project-ref <ref>
supabase db push
```

> ⚠️ Sur une base **déjà** dotée de RLS, n'applique pas `init_schema` + `rls`
> tels quels (doublons) : utilise la migration de réconciliation. Sur une base
> vierge, applique les 3 premières.

## 8. Tests

```bash
# SPA
npm test          # vitest (hermétique : aucun appel réseau réel)
npm run test:e2e  # Playwright

# Orchestrateur
cd orchestrator && npm test
```

Le harnais est **hermétique** : `fetch`/`EventSource` non mockés échouent
immédiatement, et aucune variable `.env.local` ne fuit dans les tests.

## 9. Architecture

```
SPA (React) ──anon+JWT──▶ Supabase (Postgres + Auth + RLS + Edge Functions)
   │                              ▲
   │ Bearer API key / ticket SSE  │ service_role
   ▼                              │
Orchestrateur (Fastify) ──────────┘
   ├─ moteur d'orchestration (machine à états, HITL)
   ├─ GraphStore (interface ASYNC) : InMemoryGraphStore | PgGraphStore
   ├─ client + serveur MCP (JSON-RPC)
   └─ notifier (Slack + Edge Function email)
```

- **Source de vérité** : Supabase/Postgres (persistance) ; orchestrateur = moteur
  d'exécution ; SPA = projection/cache temporaire ; CSV/XLSX = import/export seulement.
- Le moteur consomme un **store explicitement asynchrone** : toute écriture SQL est
  attendue avant de répondre (aucun cast contournant le typage).

## 10. Sécurité

- **Secrets** : aucun secret versionné ; `.env*` et archives (`*.zip`) ignorés.
- **SSRF** : URLs MCP et webhooks passent par `ssrfGuard` (https en prod, DNS résolu
  + IP privées/loopback/link-local/métadonnées bloquées, redirections revalidées,
  timeout, taille max, allowlist).
- **DTO** : `GET /api/graph` n'expose jamais prompts système, URL MCP, webhooks ni secrets.
- **SSE** : flux authentifié par **ticket court à usage unique** (jamais de clé en URL).
- **CORS** : allowlist explicite (`CORS_ALLOWED_ORIGINS`), jamais `*`.
- **Notifications** : Edge Function `notify-email` vérifie l'appelant (service_role),
  restreint le destinataire au workflow (anti-relais), expéditeur fixe, idempotence.
- **Import/export** : limites XLSX (taille/feuilles/lignes/colonnes/cellules) +
  neutralisation de l'injection de formules CSV.

## 11. Modèle d'autorisation

Deux identités distinctes :

- **Utilisateurs humains** : session Supabase (JWT) + rôle dans `workspace_members`
  (`owner` > `admin` > `member` > `viewer`), protégés par RLS.
- **Clés API techniques** (agents/services) : Bearer `ok_…`, hashées (SHA-256),
  porteuses de **scopes** :

| Scope | Action |
|---|---|
| `graph:read` / `node:read` / `execution:read` | lecture |
| `node:run` | exécuter un nœud |
| `human:approve` / `human:reject` / `node:reset` | validation **humaine** |
| `workspace:admin` | administration |

> Une clé technique **ne reçoit jamais** les scopes humains (`human:*`, `node:reset`,
> `workspace:admin`) : un agent ne peut donc pas contourner la validation humaine.
> Chaque opération vérifie l'appartenance au workspace.

## 12. Rotation des clés API

- Créées via la RPC `create_workspace_api_key` (UI *Clés API*) — la valeur complète
  n'est affichée **qu'une fois** ; seul le hash est stocké.
- **Révocation** : `revoked_at = now()` (jamais de suppression — audit).
- **Rotation** : créer une nouvelle clé, migrer l'agent, révoquer l'ancienne.
- **Expiration** : `expires_at` optionnel ; une clé expirée est refusée.

## 13. Limites connues

- **`xlsx`** : CVE (prototype pollution / ReDoS) sans correctif npm — atténué côté
  app (limites d'import + import dynamique). À terme : épingler le build SheetJS CDN
  ou remplacer la bibliothèque.
- **Validation humaine via orchestrateur** : protégée par scopes ; la vérification
  forte par **session utilisateur (JWT Supabase)** côté orchestrateur reste à câbler.
- Caches CSV legacy (`storageService`) globaux (organigramme RH mono-source).
- Bundle : libs lourdes (recharts/xlsx/jspdf) chargées à la demande ; le grand
  organigramme peut encore bénéficier de virtualisation.
- Projet Supabase free-tier : se met en pause après inactivité (restaurer au besoin).

---

## Vérification rapide

```bash
npm run lint && npm run build && npm test          # SPA
cd orchestrator && npm run build && npm test       # Orchestrateur
```
