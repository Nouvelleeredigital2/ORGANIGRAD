# Manuel opérationnel — Organigrad

## Identité du projet

Organigrad est une SPA et un service d’orchestration pour organiser des humains, des agents IA et des logiciels MCP dans des workspaces cloisonnés. Le produit couvre l’organigramme RH, un graphe hybride exécutable, la validation humaine, les projets, les bots et les circuits de travail.

Utilisateurs principaux : membres d’un workspace, responsables humains, administrateurs et propriétaires. Les agents et services techniques accèdent à l’orchestrateur avec des clés API limitées par scopes.

## Stack observée

- Frontend : React 19, TypeScript 5.9, Vite 7, Tailwind CSS 3, Framer Motion.
- Données frontend : Supabase JS, caches `localStorage` pour le mode hors ligne, CSV/XLSX pour import/export.
- Backend : Node.js, TypeScript, Fastify 5, `postgres.js`.
- Données : Supabase/PostgreSQL, Auth, RLS, Realtime, Edge Function Deno `notify-email`.
- Orchestration : machine à états, REST, SSE, MCP JSON-RPC, workers de circuits optionnels.
- Tests : Vitest, Testing Library, Playwright, PGlite et suites PostgreSQL réelles optionnelles.
- Livraison : Docker/Nginx pour la SPA, Docker Node pour l’orchestrateur, Vercel configuré pour la SPA, GitHub Actions.
- IA : fiches de bots et compilation de prompts, exécution déléguée à MCP/Hermès/Engine. Aucun RAG n’est implémenté dans ce dépôt.

## Commandes utiles

Prérequis documentés : Node.js 20+ et npm 10+.

```powershell
# SPA — racine
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e

# Orchestrateur
Set-Location orchestrator
npm ci
npm run dev
npm run typecheck
npm test
npm run build

# PostgreSQL réel — exige TEST_DATABASE_URL vers une base isolée
npm run test:pg:graph
npm run test:pg:security
npm run test:pg:concurrency
```

Les E2E connectés (`npm run test:e2e:connected`) créent et suppriment des données. Ne jamais les diriger vers la production.

## Architecture du dépôt

- `src/App.tsx` : composition de la SPA et routage de vues par URL.
- `src/components/` : vues, organigrammes, éditeurs, auth, bots, circuits et projets.
- `src/hooks/` : sessions, workspaces, contrôleurs et pont orchestrateur.
- `src/services/` : repositories Supabase/local, client orchestrateur, imports/exports et événements.
- `src/types/` : contrats frontend.
- `orchestrator/src/api/` : bootstrap, authentification et routes Fastify.
- `orchestrator/src/domain/` : machine à états et compilation des profils de bots.
- `orchestrator/src/orchestration/` : moteur, circuits et livraison avec reçus.
- `orchestrator/src/state/` : stores mémoire et PostgreSQL.
- `orchestrator/src/mcp/` : client et serveur MCP.
- `orchestrator/src/integrations/` : Engine et Orvion.
- `orchestrator/src/synapse/` : producteur/consommateur Synapse.
- `supabase/schema/` : baseline de référence et compléments locaux.
- `supabase/migrations/` : historique et migrations incrémentales.
- `supabase/functions/notify-email/` : notification email via Resend.
- `e2e/`, `e2e-connected/`, `e2e-projects/`, `orchestrator/tests/` : suites de validation.

## Modes d’exécution et sources de vérité

- Mode connecté : PostgreSQL/Supabase est la source de vérité ; la SPA est une projection et l’orchestrateur exécute les transitions.
- Mode local frontend : données dans `localStorage`; aucune isolation serveur ni persistance partagée.
- Mode mémoire orchestrateur : développement/test uniquement, sans authentification, et opt-in explicite avec `ORCHESTRATOR_ALLOW_MEMORY=1`.
- Les CSV/XLSX sont des formats d’import/export, jamais une source de vérité en mode connecté.

## Autorisations

- Humains : JWT Supabase et rôles `viewer`, `member`, `admin`, `owner`, complétés par la RLS.
- Services : clés `ok_…` hashées et scopes explicites.
- Les décisions humaines `approve`, `reject` et `reset` exigent une session humaine vérifiée ; une clé technique ne doit pas les obtenir.
- L’orchestrateur utilise `service_role` et doit donc ajouter `workspace_id` à toute requête SQL.

## Feature flags importantes

- Frontend : `VITE_PROJECTS_ENABLED`, `VITE_PRIVATE_PROJECTS_ENABLED`.
- Orchestrateur : `PROJECTS_ENABLED`, `PRIVATE_PROJECTS_ENABLED`, `CIRCUITS_ENABLED`, `PROJECT_SERVICE_DELEGATIONS_ENABLED`, `CIRCUIT_DELIVERY_ENABLED`, `CIRCUIT_SCHEDULER_ENABLED`, `LINK_BRIDGE_ENABLED`, `SYNAPSE_CONSUMER`.
- Une fonctionnalité présente dans le code n’est pas nécessairement activée ou déployée.

## Conventions et règles de modification

- Lire ce fichier, la documentation pertinente et les tests avant toute modification.
- Préserver le cloisonnement par workspace à chaque couche.
- Réutiliser les repositories, DTO, validateurs et gardes existants avant d’ajouter un chemin parallèle.
- Ne pas modifier un statut de nœud hors de la machine à états.
- Attendre les écritures persistantes avant d’annoncer un succès.
- Ne pas exposer prompts, configurations MCP, webhooks, clés ou jetons dans les DTO, logs ou erreurs.
- Conserver le typage strict ; pas de `any`, `@ts-ignore`, cast de contournement ou `catch {}` silencieux.
- Ne pas supprimer, ignorer ou affaiblir un test pour rendre la suite verte.
- Ne jamais présenter le mode local, une fixture ou un mock comme une validation connectée.
- Toute évolution SQL doit avoir une migration idempotente et un report dans le baseline pertinent.
- Ne jamais rejouer aveuglément les migrations antérieures au 3 août 2026.
- Une action asynchrone doit exposer son succès ou son échec et préserver la saisie en cas d’erreur.

## Validation attendue

Documenter séparément : lecture du code, lint/typecheck, build, tests automatisés, E2E hermétiques, tests connectés et validation manuelle réelle. Les résultats courants sont dans `docs/testing.md`; les anomalies ouvertes sont dans `docs/KNOWN_ISSUES.md`.

Avant une affirmation fonctionnelle connectée, vérifier l’API, la persistance après rechargement, les permissions négatives et les logs. Les intégrations externes, emails réels, migrations distantes et workflows de production restent non validés sans preuve d’environnement.

## Références

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/FUNCTIONAL_MAP.md`
- `docs/DATABASE.md`
- `docs/API.md`
- `docs/AI_SYSTEM.md`
- `docs/SECURITY.md`
- `docs/testing.md`
- `tasks/BACKLOG.md`

