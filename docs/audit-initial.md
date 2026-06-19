# Audit technique initial — Organigrad

> Snapshot des problèmes identifiés au début du durcissement et de leur résolution.
> L'état « après » correspond au code actuel (P0–P12 livrés). Voir
> `docs/final-correction-report.md` pour le rapport complet.

## Architecture

- **SPA** `src/` — React 19 + Vite + Tailwind ; données via Supabase (anon + JWT).
- **Orchestrateur** `orchestrator/` — Node + Fastify + `postgres.js` ; moteur
  d'orchestration (machine à états HITL), client/serveur MCP, notifier.
- **Supabase** — Postgres (source de vérité), Auth, RLS, Edge Function `notify-email`.
- **Import/export** — CSV (papaparse) + XLSX (xlsx) côté SPA.

Points d'entrée : SPA `src/main.tsx` → `App.tsx` ; orchestrateur `src/api/bootstrap.ts`
→ `pgServer.ts` (prod) ou `server.ts` (in-memory).

## Risques identifiés (et statut)

### Critiques
- **Moteur consommant le store async comme synchrone** (casts `as never`) → écritures
  SQL non attendues. **Résolu** (interface `GraphStore` async, `await` partout, casts supprimés).
- **Clé API technique pouvant approuver/rejeter** (contournement HITL). **Résolu**
  (modèle de scopes ; `human:*` jamais accordés à une clé technique).

### Élevés
- **Clé permanente dans l'URL SSE** (`?key=`). **Résolu** (ticket à usage unique).
- **Fuite de secrets via `GET /api/graph`** (prompts, URL MCP, webhooks). **Résolu** (DTO public).
- **SSRF** sur URLs MCP / webhooks configurables. **Résolu** (`ssrfGuard`).
- **CORS `origin: true`** (toute origine). **Résolu** (allowlist).
- **Edge `notify-email` = relais ouvert** (pas d'auth caller, `to` arbitraire). **Résolu**.

### Moyens
- En-tête `Authorization` construit mais non transmis (email). **Résolu**.
- Réponses HTTP non-2xx traitées comme succès (notifier). **Résolu** (`res.ok`).
- Caches frontend non cloisonnés par workspace. **Résolu** (namespacing + bannière stale).
- Schéma DB non versionné. **Résolu** (migrations `supabase/migrations/`).
- Lint frontend en erreur (33 problèmes). **Résolu** (ESLint 0).
- Bundle principal ~1,48 Mo. **Résolu** (lazy-load + manualChunks → entrée ~68 kB).
- Imports XLSX sans limites + injection de formules CSV. **Résolu** (`sheetSecurity`).
- A11y (lang, modales, labels, `h-screen`). **Résolu**.

## Dette technique restante (voir rapport final)
- Vérification de **session utilisateur (JWT)** pour `approve/reject` (aujourd'hui par scopes).
- CVE `xlsx` (pas de correctif npm).
- Test d'intégration **PostgreSQL réel** (Testcontainers) à câbler.
- Chiffrement au repos des secrets d'intégration ; audit log ; rate-limiting notifications.

## État reproductible
```
# SPA
npm ci && npm run lint && npm run typecheck && npm run test && npm run build
# Orchestrateur
cd orchestrator && npm ci && npm run typecheck && npm run test && npm run build
```
