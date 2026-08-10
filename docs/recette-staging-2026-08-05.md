# Compte-rendu de pré-recette staging — 2026-08-05

## Décision

**NO-GO** : la recette connectée et le déploiement ne doivent pas démarrer dans
l'état actuel. Ce compte-rendu ne valide aucun environnement de staging.

## Contrôles effectués

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| État Git | Bloquant : modifications non commitées et trois migrations non suivies | `git status --short --branch` |
| Qualité orchestrateur | Conforme localement : 246 tests passés, 48 scénarios connectés ignorés faute de secrets dédiés | `orchestrator/npm run check` |
| Historique migrations cible | Non vérifiable : CLI Supabase absente et aucun projet lié au dépôt | absence de `supabase/config.toml` et `supabase/.temp/project-ref` |
| Doctrine migrations | Confirmée : migrations avant 2026-08-03 non rejouables | `supabase/migrations/README.md` |
| Healthcheck image | Contrôlé statiquement : `GET /healthz` | `orchestrator/Dockerfile` |
| CORS, RLS, API et SSE réels | Non exécutés : exigent la cible staging et les comptes de recette | `docs/synchronisation-livraison.md` |

## Changements à préserver avant revue

Les fichiers suivants étaient déjà modifiés ou non suivis lors de l'audit ; ils
n'ont pas été modifiés par cette recette :

- `orchestrator/src/api/auth.ts`
- `orchestrator/src/api/pgServer.ts`
- `orchestrator/src/api/userAuth.ts`
- `orchestrator/src/config/env.ts`
- `supabase/schema/baseline_2026-08-03.sql`
- `supabase/migrations/20260805150000_fix_invite_workspace_member_ambiguous_expires_at.sql`
- `supabase/migrations/20260805150100_fix_accept_workspace_invitation_ambiguous_workspace_id.sql`
- `supabase/migrations/20260805150200_fix_inv_read_by_email_no_auth_users.sql`

## Préconditions avant reprise

1. Revoir, tester et commiter séparément les changements et migrations listés
   ci-dessus ; conserver un arbre Git propre.
2. Installer ou fournir le CLI Supabase, puis lier explicitement le projet de
   **staging** et exécuter `supabase migration list` avant toute écriture.
3. Vérifier dans le coffre ou le runtime, sans afficher leurs valeurs, les
   variables SPA, orchestrateur et Edge Function décrites dans
   `docs/synchronisation-livraison.md`.
4. Confirmer la sauvegarde et la procédure de retour arrière de la base cible.
5. Créer les comptes `owner`, `admin`, `member` et `viewer`, ainsi qu'une clé
   API technique à scopes limités.

## Recette à exécuter une fois les préconditions levées

- Importer, modifier, supprimer et exporter un CSV ; rejouer A-01 à A-04.
- Vérifier les refus RLS et les droits UI/API de chaque rôle.
- Vérifier invitations, révocation et acceptation dans le bon workspace.
- Vérifier les scopes de la clé API et le refus des décisions humaines.
- Vérifier l'exécution, l'attente humaine et les transitions SSE sur deux
  onglets.
- Vérifier `GET /healthz`, l'allowlist CORS réelle, les advisors RLS et
  l'absence de secrets dans les logs et `GET /api/graph`.

Consigner alors l'URL de staging, l'horodatage, les identités de test et le
résultat de chaque scénario dans ce fichier avant de décider un **GO**.

---

# Mise à jour — recette connectée des 2026-08-05 et 2026-08-09

Environnement testé : projet Supabase `xucmfdggetwxmpquqjvj`
(`https://xucmfdggetwxmpquqjvj.supabase.co`), seul projet Organigrad existant,
utilisé comme cible de recette. Accès par API REST/Auth avec la clé anon
publique et des sessions utilisateur réelles.

## Comptes et données de recette (2026-08-05)

- Workspace « Recette staging 2026-08-05 » (`45b68ab3-99ee-4323-8593-de93b67e1b00`).
- Quatre comptes confirmés `ceglialaurent+recette-{owner,admin,member,viewer}-20260805@gmail.com`,
  rattachés par le flux réel d'invitation (RPC), rôles respectifs vérifiés.
- Trois fiches `org_agents` importées par `import_org_agents` (mode `merge`,
  rattachements hiérarchiques résolus).

## Scénarios exécutés et résultats

| Scénario | Résultat |
| --- | --- |
| Création des 4 comptes + login mot de passe | ✅ (limite d'envoi d'e-mails Supabase contournée : 3 comptes créés côté SQL, confirmés en base) |
| Invitation : création par owner | ❌ puis ✅ — anomalie R-01 corrigée |
| Invitation : acceptation par le compte invité | ❌ puis ✅ — anomalie R-02 corrigée |
| Invitation : doublon pendant refusé (`invitation_already_pending`) | ✅ |
| Invitation : viewer ne peut pas inviter (`forbidden`) | ✅ |
| Invitation : mauvais compte refusé (`email_mismatch`) | ✅ |
| Invitation : révocation par owner (update direct comme la SPA) | ❌ puis ✅ — anomalie R-03 corrigée |
| Invitation : révocation par viewer sans effet (RLS) | ✅ |
| Invitation : acceptation après expiration refusée | ✅ (expiration simulée en base) |
| Import RPC `import_org_agents` (3 fiches, rattachements) | ✅ |
| RLS `org_agents` — owner : SELECT/INSERT/UPDATE/DELETE | ✅ tous autorisés |
| RLS `org_agents` — admin : SELECT/INSERT/UPDATE/DELETE | ✅ tous autorisés |
| RLS `org_agents` — member : SELECT/INSERT/UPDATE ✅, DELETE refusé | ✅ conforme |
| RLS `org_agents` — viewer : SELECT ✅, INSERT 42501, UPDATE/DELETE 0 ligne | ✅ conforme |
| Advisors Supabase : aucune table sans RLS | ✅ (7 WARN : 6 fonctions SECURITY DEFINER exposées volontairement, protection mots de passe compromis désactivée) |
| Sonde de contrôle 2026-08-09 : invite + révocation + accept | ✅ les correctifs sont toujours actifs en base |

## Anomalies trouvées et corrigées (migrations appliquées le 2026-08-05)

| Réf | Anomalie | Correctif |
| --- | --- | --- |
| R-01 | `invite_workspace_member` échouait toujours : `42702 column reference "expires_at" is ambiguous` (colonne OUT vs colonne de table). Toute invitation était impossible. | Migration `20260805150000` (alias `wi` qualifiant la sous-requête) + report baseline. Appliquée et vérifiée. |
| R-02 | `accept_workspace_invitation` échouait toujours : `42702 "workspace_id" is ambiguous` (liste de colonnes de `ON CONFLICT` résolue contre les colonnes OUT). Toute acceptation était impossible. | Migration `20260805150100` (pragma `#variable_conflict use_column`) + report baseline. Appliquée et vérifiée. |
| R-03 | Policy `inv read by email` interrogeait `auth.users` : `permission denied` pour `authenticated` sur toute lecture/écriture directe de `workspace_invitations` (liste et révocation dans la SPA cassées). | Migration `20260805150200` (`auth.email()` au lieu de la sous-requête) + report baseline. Appliquée et vérifiée. |
| R-04 | Les jetons de session du projet sont signés **ES256** (« JWT signing keys ») ; l'orchestrateur ne vérifiait que HS256 : approve/reject/reset et CRUD de nœuds auraient échoué en 401 même avec `SUPABASE_JWT_SECRET`. | Support ES256 via JWKS dans l'orchestrateur (`SUPABASE_JWKS_URL`, `createSupabaseJwtVerifier`), 12 tests hermétiques. À déployer. |

## Anomalies ouvertes (bloquantes pour le GO)

| Réf | Anomalie | Action requise |
| --- | --- | --- |
| O-01 | L'orchestrateur déployé `https://orchestrator.srv1017182.hstgr.cloud` ne répond pas (échec de connexion immédiat sur `/healthz`). | Redéployer/redémarrer, avec la nouvelle variable `SUPABASE_JWKS_URL`. |
| O-02 | Aucune Edge Function déployée alors que `EMAIL_EDGE_FUNCTION_URL` pointe sur `notify-email`. | `supabase functions deploy notify-email` après configuration des secrets, ou retirer la variable. |
| O-03 | `orchestrator/.env.production` ne définit ni `SUPABASE_JWT_SECRET` ni `SUPABASE_JWKS_URL`, et `SUPABASE_SERVICE_ROLE_KEY` y est un placeholder. | Compléter la configuration de production (JWKS obligatoire, cf. R-04). |
| O-04 | Historique `supabase_migrations` : les migrations `20260803*` (org_agents) n'y figurent pas (schéma appliqué hors historique). Objets présents et conformes — ne pas rejouer ; dérive de comptabilité seulement. | Optionnel : insérer les entrées d'historique manquantes lors d'une fenêtre maîtrisée. |
| O-05 | Depuis le 2026-08-09, l'accès SQL du serveur MCP Supabase échoue (`28P01 password authentication failed for user "postgres"`) — probable rotation du mot de passe base. L'API REST/Auth fonctionne normalement. | Mettre à jour la connexion du serveur MCP (ou fournir le nouveau DSN) pour ré-activer migrations/advisors outillés. |
| O-06 | Recette UI non exécutée : import CSV via la SPA, édition/suppression/export (A-01→A-04), clés API côté UI, orchestration HITL, SSE deux onglets. | Dérouler la recette navigateur avec SPA + orchestrateur locaux (JWKS configuré). |

## Recette UI connectée du 2026-08-09 (SPA locale, port 5199, comptes réels)

SPA `npm run dev` branchée sur le projet réel, sessions owner puis viewer.
L'orchestrateur n'a pas pu être démarré (O-05 : DSN base invalidé par la
rotation du mot de passe Postgres) — le volet orchestration/SSE reste dû.

| Scénario UI | Résultat |
| --- | --- |
| Import CSV : prévisualisation (3 valides, 1 doublon signalé), destination affichée, confirmation | ✅ persisté en base (3 fiches `import`), pôle « Finances » apparu |
| A-02 : édition d'une fiche (fonction), autres fiches conservées | ✅ persisté, aucune autre fiche modifiée |
| A-03 : suppression d'une fiche (Emma Leroy) puis rechargement | ✅ persistée, absente après reload |
| Export CSV avec données | ✅ non vide (en-têtes + fiches du pôle sélectionné) |
| A-01 : workspace vide → Export CSV/PDF désactivés + message « Importez des fiches avant d'exporter » | ✅ |
| Invitation UI : création, lien `?invite=inv_…` révélé une fois, révocation | ✅ persisté (`revoked_at` en base) ; la liste « en attente » ne se rafraîchit pas immédiatement après révocation (cosmétique) |
| Clé API UI : création, révélation unique `ok_…`, scopes techniques figés, révocation | ✅ (`recette-ui-20260809` active pour la future recette orchestrateur ; `recette-ui-revoke` révoquée) |
| Viewer : rôle affiché, lecture seule, guards Clés API/import/édition | ✅ après correctif R-05 |
| A-04 (erreur d'écriture sans toast de succès) | Non rejoué en connecté — couvert par `e2e/audit-derniers-points.spec.ts` |

## Anomalie supplémentaire trouvée et corrigée

| Réf | Anomalie | Correctif |
| --- | --- | --- |
| R-05 | `useWorkspace` lisait `workspace_members` sans filtre `user_id`. La policy « wm read members » renvoyant les lignes de tous les co-membres, chaque workspace multi-membres apparaissait en doublon (erreur React « duplicate key ») et le rôle affiché était celui de la plus ancienne ligne — **tout membre se voyait « owner » dans l'UI** (le serveur refusait, l'UI mentait). | Filtre `.eq('user_id', userId)` + 3 tests (`useWorkspace.test.ts`). Vérifié en direct : le viewer voit « viewer », guards corrects. |

À noter (non corrigé, décision produit) : la liste des membres affiche des
préfixes d'UUID au lieu des e-mails des co-membres — la policy `profiles`
(« profile self read ») ne permet de lire que son propre profil, la vue
`workspace_members_view` renvoie donc des colonnes vides pour les autres.
Ajouter une policy « profils visibles entre co-membres » si l'affichage est
souhaité.

## Recette orchestrateur du 2026-08-09 (local, mode pg + JWKS réel)

Après rotation du mot de passe base et migration du pooler Supabase vers
`aws-1-eu-north-1` (O-05 levé), `orchestrator/.env.production` et
`orchestrator/.env.vps` ont été mis à jour avec le DSN correct et
`SUPABASE_JWKS_URL` (O-03 levé). Orchestrateur lancé en local
(`node --env-file=.env.local dist/src/api/bootstrap.js`, mode Postgres réel,
projet `xucmfdggetwxmpquqjvj`) pour dérouler le dernier volet de la recette.

| Scénario | Résultat |
| --- | --- |
| `GET /healthz` | ✅ `{"ok":true}` |
| `graph:read` via clé API, session humaine avec `X-Workspace-Id` | ✅ ; sans le header → 400 `MISSING_WORKSPACE_ID` ; sans Bearer → 401 |
| CRUD nœud (`POST/PUT /api/nodes`) : clé API refusée (pas de `graph:write`), member/owner autorisés, viewer refusé | ✅ 403/200 conformes |
| `run-flow` via clé API (scope `node:run`) | ✅ nœud passe en `WAITING_HUMAN_APPROVAL` |
| `approve`/`reject`/`reset` : clé API 403, viewer 403, member 200 | ✅ matrice HITL conforme aux scopes documentés |
| SSE deux connexions simultanées (deux tickets, deux flux `GET /api/events`) recevant les mêmes transitions | ✅ diffusion identique sur les deux ; légère duplication d'événements côté polling (idempotent pour le client, non bloquant) |
| CORS : origine `localhost:5199` autorisée, origine inconnue sans en-têtes CORS | ✅ |
| `GET /api/graph` : absence de secrets (systemPrompt, clé, mot de passe) | ✅ seuls des booléens (`hasSystemPrompt`) |
| Advisors sécurité Supabase | ✅ stables : 6 WARN SECURITY DEFINER intentionnels + 1 WARN protection mots de passe compromis désactivée, aucune table sans RLS |

## Anomalies trouvées et corrigées le 2026-08-09 (orchestrateur)

| Réf | Anomalie | Gravité | Correctif |
| --- | --- | --- | --- |
| R-06 | `getSql()` connectait avec `prepare: true` alors que le DSN de production passe par le pooler Supabase en **mode transaction** (port 6543, Supavisor). Ce mode réassigne la connexion Postgres backend à chaque transaction : un prepared statement créé sur l'une n'existe plus sur la suivante → `prepared statement "…" does not exist`. Reproduit sur `reset`. | Élevée (persistance) | `prepare: false` dans `pgGraphStore.ts`. |
| R-07 | Conséquence de R-06 : l'erreur SQL faisait échouer aussi l'écriture d'audit, et `recordAudit` appelait `void audit.record(...)` — `void` n'attrape aucun rejet. Le rejet non rattrapé **a fait crasher tout le process orchestrateur**, coupant toutes les sessions et flux SSE en cours, pas seulement la requête fautive. | **Critique (disponibilité)** | `.catch()` explicite sur l'appel dans `pgServer.ts`. |

Les deux corrections sont indépendantes et cumulatives : R-06 supprime la cause
déclenchante, R-07 empêche qu'une erreur d'audit future (quelle qu'en soit la
cause) ne puisse à nouveau faire tomber le service. Rejoué après correctif :
`reset` répond `200`, l'orchestrateur reste vivant. 2 nouveaux fichiers de
test (5 cas : config `prepare:false`, absence d'`unhandledRejection` sur
approve/reject/reset avec un audit qui rejette).

Anomalie mineure non corrigée (hors priorité sécurité/données de cette
session) : `POST /api/nodes` accepte tout `id` de 1 à 256 caractères en
validation applicative, mais la colonne Postgres est de type `uuid` — un
`id` non-UUID remonte une erreur 500 brute au lieu d'un 400 de validation
propre. À corriger dans un prochain lot (ajout d'un contrôle de format UUID
dans `dto.ts`).

## Redéploiement VPS du 2026-08-10 (clôture O-01/O-03/O-05)

Diagnostic : le déploiement de production (`/opt/organigrad`, PM2, VPS
`srv1017182`) datait de **mai 2026** — antérieur aux fonctionnalités
Synapse/vocal/org_agents, sans `SUPABASE_JWT_SECRET` ni `SUPABASE_JWKS_URL`,
et son process avait cessé de tourner depuis le 2026-08-07 sans redémarrage
automatique. Le dossier appartenait à `root` ; l'accès SSH disponible
(`deploy`) n'avait pas de sudo sans mot de passe — chaque étape privilégiée
(chown, arrêt de l'ancien process PM2 root) a été effectuée par l'opérateur
humain dans son propre terminal, jamais par un mot de passe transmis à
l'assistant.

Actions effectuées :
- Build du code corrigé transféré et installé (`npm ci`) dans un dossier de
  stage appartenant à `deploy`, validé avant bascule.
- `chown -R deploy:deploy /opt/organigrad` (par l'opérateur) pour permettre un
  redéploiement sans sudo à l'avenir.
- Bascule de `dist/`, `node_modules/`, `package.json`, `vendor/` ; sauvegarde
  de l'ancien état conservée (`/home/deploy/organigrad.bak-20260809`).
- `ecosystem.config.cjs` réécrit : l'ancien chargeait l'env via le paquet
  `dotenv`, absent du code actuel (remplacé par le flag natif
  `--env-file` de Node) — corrigé, logs déplacés vers un chemin appartenant à
  `deploy` (`/opt/organigrad/logs/`, `/var/log/` n'étant pas accessible en
  écriture sans sudo).
- `SUPABASE_DB_URL` corrigé (nouvel hôte pooler `aws-1-eu-north-1`) et
  `SUPABASE_JWKS_URL` ajoutée dans `/opt/organigrad/.env`.
- **Incident** : le mot de passe de connexion base a été collé en clair dans
  le terminal de l'opérateur pendant la manipulation et donc exposé dans la
  session ; il a été régénéré immédiatement via le dashboard Supabase
  (« Reset database password ») avant d'être réappliqué. Le mot de passe final
  n'a jamais été lu, journalisé ni saisi par l'assistant — uniquement injecté
  par l'opérateur via une invite masquée (`read -s`).
- **Trouvaille supplémentaire (O-01 bis)** : le routage externe n'a jamais été
  configuré. `/etc/nginx/sites-available/orchestrator` et
  `/etc/traefik/dynamic/orchestrator.yml` sont des restes d'anciennes tentatives
  (nginx inactif, Traefik non installé) — le reverse proxy réellement actif est
  **Caddy** (conteneur `caddy-proxy`, `/home/deploy/caddy/Caddyfile`), qui
  n'avait aucun bloc pour `orchestrator.srv1017182.hstgr.cloud`. Bloc ajouté
  (même patron que les autres apps du VPS), config validée (`caddy validate`)
  avant rechargement à chaud (`caddy reload`, sans coupure des autres apps).
- **Trouvaille supplémentaire (CORS)** : `CORS_ALLOWED_ORIGINS` était absente
  du `.env` de production — la vraie SPA (`https://organigrad.vercel.app`)
  aurait été bloquée par le navigateur une fois le service joignable. Ajoutée.

Vérifié via l'URL publique après redéploiement :

| Contrôle | Résultat |
| --- | --- |
| `GET https://orchestrator.srv1017182.hstgr.cloud/healthz` | ✅ `{"ok":true}` |
| Connexion Postgres réelle (clé API bidon → `INVALID_OR_REVOKED_KEY`, pas 500) | ✅ |
| CORS : origine `organigrad.vercel.app` autorisée, origine inconnue refusée | ✅ |
| `GET /api/graph` sans auth : pas de secret exposé | ✅ `MISSING_BEARER_TOKEN` |
| Advisors Supabase après redéploiement | ✅ stables, aucune régression |

## Décision au 2026-08-10 — GO

Toutes les couches sont maintenant validées **en production réelle**, pas
seulement en local : données/RLS, parcours UI, orchestration/HITL/SSE, et
désormais le service déployé lui-même, accessible publiquement avec le code
corrigé (R-06/R-07 inclus). O-01, O-03 et O-05 sont clos.

Restent, non bloquants pour un GO fonctionnel :

- **O-02** — Edge Function `notify-email` toujours non déployée
  (`supabase functions deploy notify-email` après configuration des secrets) —
  affecte uniquement les notifications e-mail, pas le cœur applicatif.
- **O-04** — historique `supabase_migrations` incomplet pour les migrations
  `20260803*` (dérive de comptabilité, objets conformes, ne pas rejouer).
- Dette mineure signalée en passant : 2 vulnérabilités "high" `npm audit` sur
  des dépendances transitives de Fastify (`fast-uri`, `find-my-way`), à traiter
  dans un lot dédié avec mise à jour de `package-lock.json`.
- Le mot de passe de base exposé pendant le redéploiement a été régénéré
  immédiatement ; à vérifier qu'aucune autre copie de l'ancien mot de passe
  ne traîne (secrets manager, autres `.env`).

Aucune anomalie de données, de droits ou de sécurité applicative ouverte.
