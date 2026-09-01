# Organigrad — reste à faire avant la validation production

**État au 2026-09-01**

Ce document distingue les corrections réalisées dans le dépôt, les contrôles
réussis localement et les actions qui nécessitent encore un accès à Supabase,
Vercel, Resend ou à un projet de test connecté.

## 1. Corrections déjà réalisées dans le code

- Validation stricte des UUID côté orchestrateur.
- Suppression du canal WhatsApp non implémenté dans les types, DTO et services.
- Conservation des canaux email, Slack et Telegram lorsqu'un ancien payload
  contient encore une propriété WhatsApp.
- Verrouillage optimiste sur `hybrid_nodes` et `org_agents` avec `updated_at`.
- Détection des conflits d'écriture et réponse HTTP `409`.
- Verrouillage des imports groupés `org_agents` avec advisory lock et version
  attendue.
- Correction de la précision sub-microseconde des timestamps PostgreSQL dans
  `PgGraphStore`.
- Correction de l'indicateur de sauvegarde de la configuration orchestrateur.
- Alignement des types Supabase avec les colonnes `external_app`, `scopes`,
  `expires_at` et `idempotency_key`.
- Mise à jour du test de concurrence et du job CI pour vérifier le conflit
  optimiste réel.

## 2. Vérifications locales réussies

| Contrôle | Résultat |
|---|---:|
| Typecheck frontend | ✅ |
| Tests frontend ciblés | ✅ 17/17 |
| Typecheck orchestrateur | ✅ |
| Tests orchestrateur | ✅ 289/289 |
| Build frontend | ✅ |
| Tests PostgreSQL graph | ✅ 5/5 |
| Tests PostgreSQL sécurité/RLS | ✅ 11/11 |
| Tests PostgreSQL concurrence | ✅ 3/3 |
| Tests E2E hermétiques | ✅ 47/47 |
| Audit npm high/critical | ✅ 0 |

## 3. État public constaté

| Élément | État | Interprétation |
|---|---|---|
| `orchestrator.../healthz` | ✅ HTTP 200 | Orchestrateur joignable et sain |
| `functions/v1/notify-email` | ✅ HTTP 401 sans authentification | Fonction présente et protégée ; réception non prouvée |
| `organigrad.vercel.app` | ❌ HTTP 404 | SPA publique non accessible |

## 4. Actions restantes bloquantes

### P0 — Publier et vérifier la SPA

1. Identifier le projet Vercel associé au dépôt.
2. Vérifier la branche et le répertoire de build.
3. Vérifier les variables de build sans les afficher :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - URL publique de l'orchestrateur
4. Publier la branche `master`.
5. Tester `/`, une route interne et un rafraîchissement direct.

**Critère de clôture :** l'URL publique charge l'application et permet
d'atteindre l'écran de connexion.

### P0 — Appliquer et contrôler les migrations Supabase

1. Comparer l'historique distant avec `supabase/migrations/`.
2. Vérifier les contrôles de sécurité R1, R4 et R5 dans
   `docs/security/verification-p0-2-supabase.md`.
3. Vérifier que la migration
   `20260901090000_import_org_agents_optimistic_lock.sql` est appliquée.
4. Vérifier la fonction `import_org_agents` à six paramètres.
5. Vérifier les droits `authenticated` et `service_role`.
6. Vérifier l'absence de l'ancien overload à cinq paramètres.
7. Exécuter la migration uniquement après comparaison et sauvegarde contrôlée.

**Critère de clôture :** R1/R4 sont conformes, R5 est expliqué, et la fonction
SQL distante correspond au dépôt.

### P0 — Valider les emails de bout en bout

1. Vérifier la présence de `RESEND_API_KEY` et `EMAIL_FROM` dans Supabase,
   sans afficher leurs valeurs.
2. Déclencher une validation humaine depuis l'application.
3. Vérifier la réponse de l'Edge Function.
4. Confirmer la réception réelle de l'email.
5. Répéter la même transition et vérifier l'idempotence.

**Critère de clôture :** un email réel est reçu et un retry identique ne crée
pas de doublon.

## 5. Actions restantes non bloquantes mais nécessaires

### P1 — Tests connectés

- Utiliser un projet Supabase de test séparé de la production.
- Renseigner `.env.connected` uniquement localement ou via les secrets CI.
- Exécuter `npm run test:e2e:connected`.
- Exécuter les suites avec `TEST_DATABASE_URL`.
- Ne jamais utiliser `.env.connected.example` pour cibler la production.

### P1 — Recette fonctionnelle réelle

- Tester les quatre rôles : owner, admin, member, viewer.
- Tester inscription et lien magique avec une vraie boîte email.
- Tester invitation, acceptation et révocation.
- Tester deux utilisateurs sur le même workspace.
- Tester Realtime avec deux consommateurs.
- Tester le parcours orchestration : exécution, attente, approbation,
  rejet, journal et SSE.

### P2 — Qualité et exploitation

- Décider si l'historique complet et la restauration des versions sont requis.
- Réconcilier définitivement l'historique `supabase_migrations` si nécessaire.
- Mettre à jour le baseline Supabase après validation de la nouvelle migration.
- Ajouter une procédure de reprise des réservations email `pending` orphelines.
- Vérifier les alertes et logs de production après déploiement.

## 6. Définition de « 100 % »

L'application pourra être déclarée fonctionnelle à 100 % lorsque les six
conditions suivantes seront prouvées :

1. SPA publique accessible et connexion fonctionnelle.
2. Quatre rôles validés manuellement.
3. Email HITL réellement reçu.
4. Orchestration complète validée avec SSE et journal.
5. Tests connectés Supabase réussis sur un projet de test.
6. Aucun défaut connu non classé ou non accepté explicitement.

## 7. Fichiers de référence

- `docs/audit-2026-08-22-fonctionnel.md`
- `docs/security/verification-p0-2-supabase.md`
- `docs/security/notify-email-audit.md`
- `docs/plans/2026-08-14-runbook-mainteneur.md`
- `supabase/migrations/README.md`
- `supabase/schema/README.md`
