# AUDIT ORGANIGRAD — 2026-08-29

Audit de code, audit fonctionnel et pistes d'amélioration. Lecture seule — aucune modification de code.
Étiquettes : `[CODE]` vérifié dans la source (fichier:ligne) · `[DOC]` issu de la documentation du dépôt · `[À CONFIRMER]` hypothèse non vérifiable statiquement.

---

## 1. Synthèse exécutive

Application saine dans son socle : typecheck 0 erreur, lint propre, zéro injection SQL, zéro `any`, RLS complète sur les 10 tables, autorisation systématiquement vérifiée côté serveur (workspace dérivé du token), zéro bouton mort sur ~95 éléments interactifs inventoriés. Aucun P0. **7 constats P1**, ~28 P2, ~49 P3. Verdict admin : **PRÊT AVEC RÉSERVES** (exploitable sur un petit périmètre ; non prêt au-delà). Les 3 points les plus urgents : (1) bascule silencieuse en écriture Supabase directe — secrets en clair — quand l'orchestrateur configuré est éteint ; (2) boucle infinie possible sur cycle de graphe dans `runFlow` ; (3) policy RLS `wm write admin FOR ALL` permettant à un admin de rétrograder/évincer l'owner via l'API directe.

## 2. Tableau de bord

| Phase | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| 1 — Code | 0 | 5 | 17 | ~35 |
| 2 — Fonctionnel | 0 | 1 | 5 | ~10 |
| 3 — Admin | 0 | 1 | 6 | ~4 |
| **Total** | **0** | **7** | **~28** | **~49** |

---

## Phase 0 — Cartographie

Une seule application produit, deux composants : **frontend** (racine — Vite 7, React 19, TS 5.9, Tailwind 3.4, supabase-js 2.105) et **backend orchestrator** (`orchestrator/` — Fastify 5, driver `postgres`, contrat `@apps2026/contracts` 1.1.1 vendoré). `[CODE]` package.json des deux composants. Base : Supabase (projet `xucmfdggetwxmpquqjvj` `[DOC]`). Les dossiers `Fiche_Agent_Mode_Edition/`, `Organigramme_Dynamique/`, `Tableau_de_Bord_Horizontale/` sont des maquettes HTML statiques.

**Vues front** (routage query-string `?v=`, [src/routing/appUrl.ts:16](src/routing/appUrl.ts)) : `orgchart` (défaut), `dashboard`, `orchestration`, `members` (admin), `api-keys` (admin), `settings`. Paramètres : `pole`, `agent`, `node`, `edit=1`, plus `?invite=` hors routeur.

**API backend** ([orchestrator/src/api/pgServer.ts](orchestrator/src/api/pgServer.ts)) — Bearer + scopes partout sauf `/healthz` ; SSE par ticket single-use : `/api/events/ticket`, `/api/events` (SSE), `/mcp` (JSON-RPC), `/api/integrations/link/import` (workspaceAdmin), `/api/graph`, `/api/nodes` CRUD (graphRead/graphWrite), `/api/nodes/:id/{run,run-flow}` (nodeRun), `/approve`/`/reject` (humanApprove/humanReject), `/reset` (nodeReset), `/api/voice/gateway/*`. Un second serveur in-memory sans auth existe (`routes.ts`/`server.ts`) — voir Phase 1.

**Tables versionnées** (8) : `workspaces`, `workspace_members`, `workspace_api_keys`, `hybrid_nodes`, `node_transitions`, `notifications`, `audit_log`, `org_agents` + 13 fonctions/RPC. **Hors dépôt mais en prod** `[DOC]` ([supabase/migrations/README.md:8](supabase/migrations/README.md)) : `profiles`, `workspace_invitations`, vue `workspace_members_view`, enum `workspace_role`, six fonctions. Les migrations < 2026-08-03 ne sont pas rejouables ; référence : `supabase/schema/baseline_2026-08-03.sql`.

**Volumétrie** : 197 fichiers TS/TSX/SQL hors node_modules ; 59 composants ; 38 fichiers de test front ; 30 sources orchestrator + ~30 tests ; 8 specs Playwright ; 15 migrations ; 6 vues ; 15 routes API.

---

## Phase 1 — Audit du code

Base : typecheck 0 erreur (front + back) ; ESLint propre sur les sources (208 erreurs d'un lint brut = uniquement `supabase/.temp/`, généré) ; aucune injection SQL (template tag `postgres` partout) ; aucun `any`. Les 5 P1 ont été contre-vérifiés sur pièces.

### P1

1. **Boucle infinie sur cycle de graphe** `[CODE]` — [orchestrator/src/orchestration/engine.ts:52-98] : `runFlow` suit `findDownstream` (par `parentID`) sans ensemble de visités ni profondeur max ; chaque nœud repasse `IDLE` (l.93), donc un cycle A→B→A ou un auto-parent (non bloqué par [dto.ts:72] ni la migration `parent_same_workspace`) tourne sans fin — requête bloquée, 4 écritures SQL/tour.
2. **Chemin `/mcp` cassé sous chiffrement actif** `[CODE]` — [orchestrator/src/mcp/mcpServer.ts:209-212] instancie `PgGraphStore` sans le 4ᵉ argument `cipher` (défaut `null`, [pgGraphStore.ts:59]). Avec `INTEGRATION_ENCRYPTION_KEY` posée : `mcpConfig.serverUrl` reste chiffré → `run_node`/`run_flow` MCP échouent ; `systemPrompt` part chiffré vers l'agent.
3. **Repli silencieux sur un serveur SANS auth** `[CODE]` — [orchestrator/src/api/bootstrap.ts:26-101] : sans `SUPABASE_DB_URL`, bascule en mode in-memory (`routes.ts`) sans hook d'auth ni scopes (approve l.52-60, SSE l.89) sur `0.0.0.0`. Mode ouvert sélectionné par l'absence d'une variable, pas par opt-in. Prod actuelle `[À CONFIRMER]`.
4. **Désynchronisation d'ids après promotion CSV → base** `[CODE]` — [src/hooks/useOrgChartController.ts:127-147] : `preparePersistentSnapshot` fait `bulkUpsert` (RPC `import_org_agents`, UUID générés serveur — la charge n'envoie pas d'`id`, [agentRepo.ts:180-197]) puis `setServerAgents(snapshot)` avec les ids clients → la première édition/suppression échoue (`invalid input syntax for type uuid`).
5. **Lien profond `?agent=` inopérant à froid** `[CODE]` — [useOrgChartController.ts:399-406] : `useState(route.agentId)` initialise l'état déjà égal → le bloc de surlignage ne s'exécute jamais dans un onglet neuf.

### P2 (17)

Backend : fausses notifications « Validation requise » à chaque fin de nœud IA/MCP ([engine.ts:82-93] + [notifier.ts:335-341]) · chiffrement fail-open silencieux ([pgServer.ts:85-93] `catch { _cipher = null; }`) · JWT HS256 sans `exp` accepté indéfiniment, ni `iss`/`aud` ([userAuth.ts:48]) · file `pending` du consumer Synapse non bornée ([consumer.ts:45]) · acteur d'audit `api_key` forcé via `/mcp` même pour une session humaine ([mcpServer.ts:209-212]) · `run_flow` MCP sans producteur Synapse (pas de `validation.requested`, [mcpServer.ts:214] vs [pgServer.ts:441]) · rate limiter notifications recréé par requête donc inopérant ([pgServer.ts:240-250]) · import LINK non transactionnel, compteurs faux en concurrence ([pgServer.ts:296-322]) · **PUT partiel efface `skills` et `avatarUrl`** ([dto.ts:79,84]).

Frontend : `gradeStyle` absent → `"undefined"` littéral (fallback mort, [normalizeAgent.ts:18]) · récursion infinie/branches perdues sur cycle côté client ([buildHierarchy.ts:26-39]) · secrets écrits en clair dans localStorage par le chemin orchestrateur ([hybridNodeRepo.ts:200-207]) · clé API `ok_…` permanente en localStorage ([useOrchestratorConfig.ts:55]) · échec de lecture workspaces silencieux ([useWorkspace.ts:48,67-69]) · timers de simulation non annulés + toast écrasé + conflit ⌘K ([OrchestrationView.tsx:328-342,191-198] / [useSpotlight.ts:15-31]) · export CSV sans gestion d'échec ([App.tsx:214-225]) · course de données `useGoogleSheets` ([useGoogleSheets.ts:12-29]).

### P3 (sélection, ~35)

Scroll-lock sans cleanup ([useSpotlight.ts:34-40]) · 500 = `err.message` brut ([pgServer.ts:659], [routes.ts:138]) · SSE : pertes sur `created_at` égaux, polls chevauchants, notification avant COMMIT ([pgServer.ts:581-597], [pgGraphStore.ts:208]) · SSRF TOCTOU DNS-rebinding ([ssrfGuard.ts:191-197]) · `/reject` feedback non validé côté REST · code mort (`useAsyncAction`, `importAgentsFromFile`, `storageService.clearAll`, `getNodeConfig`, `telemetry.ts`, drivers notification inatteignables, double `NodeNotFoundError`) · `createObjectURL` non révoqué · délai magique 800 ms exportPdf · `FileReader` sans onerror · `nodeExists` traite un 500 comme « existe » · livrable cherché dans les 50 dernières transitions (faux négatif, NodeDetailsModal) · `alert()` sur 3 écrans vs feedback · deux systèmes visuels (tokens vs hex en dur — règle [ui.tsx:8-9] violée) · emojis malgré la règle [tokens.ts:157] · accents manquants (écrans legacy) · `<div onClick>` inaccessibles clavier (OrgChart, HybridNodeCard, ProfileModal) · cast `InvitationRow[]` non filtré · ESLint n'ignore pas `supabase/.temp/`.

### Sécurité applicative

Aucun P0 : aucun secret versionné (vrais secrets dans des `.env` locaux gitignorés — vérifié) ; RLS activée sur les 10 tables, aucune policy `USING (true)` ; helpers SECURITY DEFINER avec search_path verrouillé et grants explicites ; `workspace_id` dérivé du token ou vérifié en base (pas de confused deputy) ; hachage SHA-256 acceptable (clés = aléas 128 bits) ; AES-256-GCM correct ; comparaison JWT timing-safe ; zéro `dangerouslySetInnerHTML`/`eval`. Dormants P3 : `verify_workspace_api_key` sans contrôle d'expiration ni scopes (sans appelant apparent `[À CONFIRMER]`) ; token d'invitation en clair (base + query string) ; `GET /api/nodes/:id` rend les secrets déchiffrés à tout porteur de `graph:write` ; comparaison non timing-safe dans l'Edge Function `notify-email`.

---

## Phase 2 — Audit fonctionnel

~95 éléments interactifs inventoriés : **aucun CASSÉ, aucun placeholder `() => {}`, aucun TODO** ; les 6 destinations de navigation sont valides ; chemins d'échec catchés avec retour utilisateur. Écarts :

| Écran | Élément | Verdict | Sévérité |
|---|---|---|---|
| Orchestration | Micro vocal | PLACEHOLDER partiel — transcription non branchée (blanc nommé, [VoiceMicButton.tsx:18-22]) ; erreur visible seulement en `title` | P2 |
| Orchestration | « Créer/Enregistrer » (NodeEditor) | Pas d'anti double-clic ([NodeEditor.tsx:353-359]) | P2 |
| Orchestration | « Run » (carte) | Pas d'anti double-clic ([HybridNodeCard.tsx:353-364]) | P2 |
| Topbar | Filament d'import | « success » avant l'import réel ([Topbar.tsx:32]) | P3 |
| Orgchart « Vue Hybride » | Run/Valider/Éditer | Non transmis par OrgChartNode (volontaire mais trompeur) | P3 |
| Membres | Select de rôle | Ni confirmation ni désactivation pendant l'appel | P3 |

**Formulaires** : validations côté client uniquement pour le format d'email d'invitation (la RPC accepte `"abc"`), les URLs MCP/Slack ([dto.ts:88-105] ne vérifie que le type), `roleTitre` (default `''` SQL), `minLength` mot de passe (`[À CONFIRMER]` politique Supabase). Messages d'erreur : français et explicites via feedback, SAUF anglais Supabase brut (AuthScreen), codes PL/pgSQL nus (AcceptInvitation), `err.message` PostgREST (Members/ApiKeys), `alert()` sur 3 écrans — P2. Comportements post-soumission corrects partout.

**Parcours** :
1. Inscription → connexion → déconnexion : **FLUIDE** (signup + magic link + signin ; garde unique `AuthGate` [App.tsx:480-491] ; mode local assumé). P3 : déconnexion cachée dans le dropdown workspace.
2. CRUD agent : **RUPTURES** — P2 : `agentsStale`/`agentsError` calculés ([useOrgChartController.ts:474-477]) mais jamais affichés → cache périmé présenté comme courant. P3 : pas de création manuelle (import seulement).
3. CRUD nœuds hybrides : **RUPTURES** — **P1 vérifié : orchestrateur configuré mais éteint → `bridge.client` null → écritures basculent en Supabase direct, secrets en clair, message « Nœud créé » sans avertissement** ([OrchestrationView.tsx:473-476] + [hybridNodeRepo.ts:211-226] ; le commentaire l.470-472 documente le défaut que ce routage devait fermer ; `runChain` est, lui, correctement bloqué). P3 : approve/reject simulés localement même en état `failed`.
4. Non-authentifié → zone protégée : **FLUIDE** (toute vue derrière AuthGate ; `?v=` préservé après login). **P2 : token `?invite=` perdu sur les parcours e-mail** (jamais persisté avant auth, `emailRedirectTo: origin` — [App.tsx:456], [AuthScreen.tsx:37]) `[À CONFIRMER]` selon templates mail.
5. Mobile : **FLUIDE** (drawer, modales `max-h`, e2e responsive existants) — P3 : padding fixe `px-12` Members/ApiKeys (96 px sur 375 px), 4 zones tactiles < 44 px, pinch tactile `[À CONFIRMER]` sur appareil.

---

## Phase 3 — Audit de l'espace admin

### Verdict : **PRÊT AVEC RÉSERVES** — exploitable par un admin non technique sur un petit périmètre (1 workspace, ≤ ~30 personnes, tant que rien n'échoue) ; NON PRÊT au-delà.

**Contrôle d'accès (point fort, vérifié)** : rôle lu depuis `workspace_members` ([useWorkspace.ts:45-52]) ; le front n'est que du masquage assumé ([permissions.ts:10-13]) ; barrière réelle = RLS `workspace_role_of` ([baseline:563-616]). `?v=members` sans rôle admin = lecture seule sans action ; `?v=api-keys` ne charge rien ([ApiKeysView.tsx:49]). Rôles cohérents front/base.

**Exception P1 `[CODE]` vérifié** : la policy `wm write admin` est `FOR ALL` sans protection de l'owner ([baseline:565-567]) — un admin, via l'API REST directe, peut rétrograder l'owner, se promouvoir `owner` (débloque `ak delete owner`), et vraisemblablement supprimer la ligne de l'owner (OR des policies permissives contourne `wm delete admin`) `[À CONFIRMER]` par test. Garde uniquement cliente ([adminGuards.ts:1-11]).

**Complétude** : CRUD unitaire correct pour membres/invitations/clés/agents/nœuds, MAIS — aucun CRUD workspace dans l'UI (policies SQL prêtes, [baseline:555-559]) ; invitations sans e-mail (copier-coller manuel, [MembersView.tsx:299-301]) et expirées sans trace ni renvoi ; aucune recherche/tri/pagination (requêtes non bornées → troncature silencieuse possible au `max-rows` PostgREST `[À CONFIRMER]`) ; aucune action en masse ; exports limités aux agents ; **Dashboard 100 % calculé sur vraies données** (rien de codé en dur — chaîne vérifiée jusqu'à [useOrgChartController.ts:354-375]) mais purement RH ; **journal `audit_log` écrit mais lu nulle part dans le front** (l'ActivityLog est un flux volatile de 30 transitions, pas un audit).

**Robustesse** : confirmations présentes sur toutes les actions destructives (en `confirm()` natif) SAUF le changement de rôle (appliqué au `onChange`, [MembersView.tsx:421-428]) ; suppressions logiques (invitations, clés) vs définitives (membres, agents, nœuds) incohérentes, sans corbeille ; échecs captés avec feedback et rollback, mais messages bruts anglais/codes RPC ; UI verrouillée sur l'owner et l'auto-gestion ; « Zone de Danger » visible par tous les rôles ([SettingsView.tsx:355-367], vérifié — refus au clic seulement).

**Blocages** : (P1) policy `wm write admin FOR ALL` ; (P2) pas de gestion workspace, invitations sans e-mail ni renvoi, erreurs techniques anglaises, audit invisible, rôle sans confirmation, ni recherche/pagination/masse/exports ; (P3) dashboard sans indicateurs admin, suppressions incohérentes, Zone de Danger affichée à tous, `confirm()` natifs.

---

## Phase 4 — Dix améliorations fonctionnelles

### 1. Création manuelle d'une fiche agent
**Problème observé** — Le « C » du CRUD n'existe que par import (Phase 2). **Proposition** — Bouton « Ajouter un agent » ouvrant ProfileModal vierge avec choix du rattachement. **Bénéfice** — RH : une arrivée se traite en 30 s sans fichier. **Effort** — S (formulaire et `upsert` existent). **Dépendances** — Correction du bug d'ids post-import (P1).

### 2. Gestion des workspaces dans l'interface
**Problème observé** — Aucune UI créer/renommer/supprimer, policies SQL prêtes (Phase 3). **Proposition** — Dans le sélecteur : « Nouveau workspace », renommage inline (owner), suppression double-confirmée. **Bénéfice** — Débloque le multi-tenant déjà payé côté base. **Effort** — M. **Dépendances** — Aucune.

### 3. Envoi et relance des invitations par e-mail
**Problème observé** — Lien copié-collé à la main ; expirées sans trace (Phase 3). **Proposition** — Envoi auto via l'Edge Function `notify-email` existante + bouton « Renvoyer ». **Bénéfice** — Onboarding autonome ; neutralise la perte du token `?invite=` (P2 Phase 2). **Effort** — M. **Dépendances** — Expéditeur configuré (Resend).

### 4. Vue « Journal d'audit »
**Problème observé** — `audit_log` alimentée mais invisible (Phase 3). **Proposition** — Onglet admin filtrable (acteur/action/période) + export CSV. **Bénéfice** — Répondre à « qui a supprimé X ? » sans SQL. **Effort** — M. **Dépendances** — Idée 5.

### 5. Recherche, pagination et actions en masse sur les listes admin
**Problème observé** — Rien de tout cela sur membres/invitations/clés ; requêtes non bornées (Phase 3). **Proposition** — Recherche + `.range()` + sélection multiple (« révoquer les invitations expirées »…). **Bénéfice** — Rend l'admin exploitable au-delà de ~30 personnes. **Effort** — M. **Dépendances** — Aucune.

### 6. Indicateur d'état des sources de données
**Problème observé** — `agentsStale`/`agentsError` jamais affichés ; état orchestrateur visible seulement dans Orchestration (Phase 2). **Proposition** — Pastille globale (topbar) : source des fiches, fraîcheur, état orchestrateur. **Bénéfice** — Fin des décisions prises sur un cache muet. **Effort** — S (les états existent). **Dépendances** — Aucune.

### 7. Messages d'erreur en français, orientés action
**Problème observé** — Anglais Supabase brut, codes PL/pgSQL nus (Phases 2-3). **Proposition** — Dictionnaire code → message français + action suggérée, détail technique repliable. **Bénéfice** — Condition de l'admin non technique. **Effort** — S (canal feedback centralisé). **Dépendances** — Aucune.

### 8. Exports administrateur
**Problème observé** — Seuls les agents s'exportent (Phase 3). **Proposition** — « Exporter CSV » sur chaque liste admin, via la sanitisation de `csvService`. **Bénéfice** — Reporting, sauvegarde avant opération de masse. **Effort** — S. **Dépendances** — Idée 5 souhaitable.

### 9. Tableau de bord d'administration
**Problème observé** — Dashboard 100 % RH, zéro indicateur d'exploitation (Phase 3). **Proposition** — Volet admin : membres/invitations/clés, validations HITL en attente avec lien direct, dernières entrées d'audit. **Bénéfice** — L'admin voit ce qui requiert son action. **Effort** — M. **Dépendances** — Idée 4 pour le bloc audit.

### 10. Corbeille et annulation des suppressions
**Problème observé** — Hard delete sans undo pour membres/agents/nœuds vs `revoked_at` ailleurs (Phase 3). **Proposition** — `deleted_at` + « Annuler » 10 s + corbeille 30 j + double saisie pour le reset. **Bénéfice** — Filet contre l'erreur humaine. **Effort** — L. **Dépendances** — Décision produit (rétention).

**Classement valeur/effort** : 7 (S) > 6 (S) > 3 (M) > 1 (S) > 8 (S) > 5 (M) > 2 (M) > 4 (M) > 9 (M) > 10 (L).
**Top 3 : 7, 6, 3** — deux efforts S qui transforment l'expérience de tous les rôles (comprendre les échecs, connaître la fraîcheur des données), puis le déblocage du parcours d'onboarding, le plus rugueux aujourd'hui pour un admin non technique.

---

## Hors périmètre — pour mémoire

- `vercel.json` présent mais inerte (hébergeur supprimé de l'écosystème) — à purger un jour.
- Des `.env` réels (service_role, DSN avec mot de passe) vivent sur le poste dans le dossier de l'app — gitignorés, mais hygiène poste/sauvegardes à surveiller ; rotation déjà tracée par ailleurs.
- `supabase/.temp/` et `supabase/.branches/` apparaissent en non-suivis dans `git status` — vérifier le .gitignore avant tout commit.
- Le healthcheck Docker/nginx et la dérive schéma dépôt/prod relèvent du déploiement, documentés ailleurs (`supabase/schema/README.md`, docs écosystème).

## Limites de cet audit

- **Aucune exécution** : ni l'application, ni les tests unitaires/E2E, ni l'orchestrateur n'ont été lancés. Tous les parcours (Phase 2) sont des analyses statiques de chaînes d'appels ; les comportements marqués `[À CONFIRMER]` (pinch tactile, templates d'e-mail Supabase, politique de mot de passe, `max-rows` PostgREST, delete de la ligne owner via `wm write admin`) exigent une exécution ou un accès à la configuration du projet Supabase.
- **Pas d'accès à la base de production** : l'audit s'appuie sur `baseline_2026-08-03.sql` et les migrations ; une partie du schéma prod a été créée hors dépôt (`[DOC]` supabase/migrations/README.md) — l'état réel des policies en prod peut différer.
- **Volumétrie** : les ~49 P3 sont une sélection représentative issue de quatre passes de lecture parallèles ; l'exhaustivité absolue au niveau P3 n'est pas garantie.
- **Périmètre exclu respecté** : rien n'a été évalué sur le déploiement, la CI/CD, la performance d'infrastructure ni le SEO.
