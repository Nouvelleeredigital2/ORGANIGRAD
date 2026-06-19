# Tests

## Commandes
```bash
# SPA (racine)
npm run lint
npm run typecheck
npm run test          # vitest
npm run test:e2e      # playwright
npm run check         # lint + typecheck + test + build

# Orchestrateur
cd orchestrator
npm run typecheck
npm run test          # vitest
npm run check         # typecheck + test
```

## Hermétisme (aucun appel réseau réel)
- **Frontend** (`src/test/setup.ts`) : `beforeEach` stubbe `fetch` et `EventSource`
  pour **échouer immédiatement** sur tout appel non mocké ; `vitest.config.ts`
  force `VITE_SUPABASE_*` à vide (aucune fuite de `.env.local`). Polyfill
  `ResizeObserver`.
- **Orchestrateur** (`orchestrator/tests/setup.ts`) : pare-feu `fetch` non mocké +
  suppression de `SUPABASE_DB_URL` (aucune connexion Postgres réelle).
- Dépendances injectables partout : `fetchImpl`, `eventSourceImpl`, `sql`, `lookup`,
  horloge (`SseTicketStore.now`). Aucun appel réel Slack / Supabase / email / MCP.

## Couverture (sélection)
- Moteur asynchrone + ordre des écritures + double-exécution (`engineAsyncStore.test.ts`).
- Autorisation par scopes (négatifs) (`mcpServer.test.ts`, `auth.test.ts`).
- SSRF (`ssrfGuard.test.ts`), tickets SSE (`sseTickets.test.ts`).
- Contrat notifications + `res.ok` (`notificationContract.test.ts`, `notifier.test.ts`).
- DTO sans secrets (`api.test.ts`), validation env (`env.test.ts`).
- Import/limites + anti-injection CSV (`sheetSecurity.test.ts`, `importService.test.ts`).
- A11y modale (`BaseModal.test.tsx`), cloisonnement cache (`hybridNodeStore.test.ts`).

## Test d'intégration PostgreSQL (à câbler)
Les tests du store utilisent l'`InMemoryGraphStore` (contrat async identique) et des
mocks SQL. Un test d'intégration **PostgreSQL réel** reste recommandé :
```bash
# Exemple Testcontainers / Docker (non encore intégré au repo)
docker run --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/postgres npm run test:integration
```
Marqué **non exécuté** tant que l'infra n'est pas branchée — ne pas considérer
comme validé.
