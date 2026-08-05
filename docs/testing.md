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

- **Frontend** (`src/test/setup.ts`) : `beforeEach` stubbe `fetch` et
  `EventSource` pour échouer immédiatement sur tout appel non mocké ;
  `vitest.config.ts` force `VITE_SUPABASE_*` à vide.
- **Orchestrateur** (`orchestrator/tests/setup.ts`) : pare-feu `fetch` non mocké
  et suppression de `SUPABASE_DB_URL`.
- Les dépendances réseau sont injectables : `fetchImpl`, `eventSourceImpl`,
  `sql`, `lookup` et l'horloge des tickets SSE. Aucun test hermétique n'appelle
  Slack, Supabase, e-mail ni MCP réel.

## Couverture (sélection)

- Moteur asynchrone, ordre des écritures et double-exécution
  (`engineAsyncStore.test.ts`).
- Autorisation par scopes, SSRF, tickets SSE, notifications, DTO sans secrets et
  validation d'environnement.
- Import borné et anti-injection CSV ; accessibilité de modale et cloisonnement
  du cache front.
- Image Docker de l'orchestrateur : son healthcheck vise `/healthz`
  (`dockerHealthcheck.test.ts`).

## Test d'intégration PostgreSQL réel

`orchestrator/tests/pgGraphStore.integration.test.ts` est exécuté uniquement si
`TEST_DATABASE_URL` est défini. Il utilise PostgreSQL réel et nettoie les données
de test isolées par UUID. Aucun script `test:integration` n'existe : lancer la
suite ciblée ainsi, après avoir démarré une base jetable :

```powershell
docker run --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
$env:TEST_DATABASE_URL = 'postgres://postgres:test@localhost:55432/postgres'
Push-Location orchestrator
npm test -- pgGraphStore.integration
Pop-Location
```

Sans `TEST_DATABASE_URL`, Vitest saute ce test : une suite verte ne prouve donc
pas la compatibilité PostgreSQL réelle.

## Tests connectés optionnels

Les scénarios B2/B5 de `orchestrator/tests/e2eVerticalSlice.test.ts` vérifient
l'idempotence avec Mémoire Vive seulement si `SUPABASE_MEMOIRE_VIVE_URL` et
`SUPABASE_MEMOIRE_VIVE_KEY` sont définies. Utiliser un projet de test dédié et
des secrets injectés par le coffre/CI ; ne jamais les placer dans `.env.test` ni
les afficher dans les journaux. En leur absence, ces scénarios sont sautés.

## TypeScript strict

`strict: true`, `noUncheckedIndexedAccess` et `noImplicitOverride` sont activés
pour le frontend et l'orchestrateur. `exactOptionalPropertyTypes` reste différé :
son activation demande encore des ajustements de types optionnels dans les deux
projets.
