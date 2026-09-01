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

## Tests PostgreSQL réels, isolés et reproductibles

Les suites PostgreSQL exigent une base vierge mais n'utilisent pas le même
schéma. Elles ne doivent donc jamais être lancées sur une seule base partagée.

Les trois commandes suivantes créent chacune un conteneur PostgreSQL 16 jetable,
choisissent un port local libre, attendent pg_isready puis arrêtent uniquement
leur propre conteneur, y compris si Vitest échoue :

    npm run test:pg:graph
    npm run test:pg:security
    npm run test:pg:concurrency

Elles couvrent respectivement PgGraphStore, l'isolation multi-workspace des RPC
et la caractérisation des écritures concurrentes. Docker doit être disponible;
aucune variable TEST_DATABASE_URL n'est à fournir manuellement.

La CI conserve le même principe d'isolation : les suites sécurité et concurrence
utilisent deux services PostgreSQL distincts. Les commandes locales sont le
moyen supporté de rejouer ces garanties sans collision de schéma.

## E2E connectée — Supabase réel (P0-5, P1-7)

`e2e-connected/` regroupe tout ce qui ne peut pas être vérifié hors ligne, soit
**22 tests** en quatre fichiers :

| Fichier | Couvre |
|---|---|
| `auth-isolation.spec.ts` | connexion, déconnexion, session au rechargement, **isolation A/B**, rôle `viewer` |
| `membres-cles-api.spec.ts` | invitations (création, doublon, rôle owner refusé), clés API (révélation unique, révocation) |
| `noeuds-persistance.spec.ts` | cycle de vie d'un nœud et **persistance réelle** après rechargement |
| `realtime-orchestration.spec.ts` | le crash Realtime à deux consommateurs (ci-dessous) |

```bash
cp .env.connected.example .env.connected   # puis renseigner
npm run test:e2e:connected
```

> **Deux comptes dans deux workspaces distincts** sont nécessaires
> (`E2E_EMAIL_B`). L'isolation ne se teste pas avec un seul compte — c'est
> précisément la configuration qu'exploitait la faille corrigée. Sans le second
> compte, ces tests se sautent ; les autres tournent.

En CI : job `connectee`, **déclenchement manuel uniquement**
(`workflow_dispatch`), avec des secrets GitHub. Il échoue explicitement si les
secrets sont absents plutôt que de passer au vert en n'ayant rien testé.

### Le cas Realtime (P0-5)

`e2e-connected/realtime-orchestration.spec.ts` couvre le scénario qui a fait
tomber la SPA le 2026-08-11 : `OrchestrationView` et `ActivityLog` abonnés au
même workspace. Il faut un **vrai** client Realtime — `supabase.channel(topic)`
rend l'instance existante, et un second `.on(...)` sur un channel déjà souscrit
lève depuis le cœur de supabase-js, hors de toute frontière React. Un mock ne le
montre pas ; c'est pourquoi ce test existe **en plus** des tests unitaires de
`src/services/realtimeShared.ts`.

Le nœud est créé **depuis Node**, pas par l'interface : seul le chemin Realtime
peut alors le faire apparaître à l'écran. Une création via l'UI passerait par la
mise à jour optimiste et ne prouverait rien.

Configuration séparée (`playwright.connected.config.ts`, port 5175) : la suite
hermétique force Supabase OFF, ce qui met la SPA en mode local — tout permis,
aucun channel. Les deux ne peuvent pas cohabiter, et la suite connectée ne doit
jamais s'exécuter par accident dans la CI hermétique.

> ⚠️ Projet Supabase **de test** uniquement : ces tests créent puis suppriment
> des nœuds. Sans `.env.connected`, les 3 tests sont sautés — une suite verte ne
> prouve donc rien ici non plus.

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
