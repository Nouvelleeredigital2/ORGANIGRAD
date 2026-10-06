# Déploiement

La procédure complète de synchronisation, de recette et de retour arrière est dans
[`synchronisation-livraison.md`](./synchronisation-livraison.md). Ce document
résume les prérequis spécifiques à chaque cible.

## Pré-requis

- Projet Supabase (Postgres 15+) avec Auth activée.
- Secrets gérés hors dépôt, conformément à
  [`security/secrets-management.md`](./security/secrets-management.md).
- Validation locale exécutée avant tout déploiement (`npm run check` à la racine,
  puis `npm run check` dans `orchestrator/`).

## Base de données Supabase

La règle d'autorité est [`../supabase/migrations/README.md`](../supabase/migrations/README.md) :
les migrations antérieures au 2026-08-03 ne sont **pas** rejouables.

- **Projet neuf** : appliquer d'abord
  [`baseline_2026-08-03.sql`](../supabase/schema/baseline_2026-08-03.sql) avec
  `psql`, puis uniquement les migrations plus récentes.
- **Projet existant** : ne pas appliquer le baseline ni rejouer les migrations
  historiques. Contrôler d'abord l'historique (`supabase migration list`) et ne
  pousser que les migrations inédites et prévues pour cette cible.
- Toute évolution de schéma doit être livrée sous forme de migration idempotente
  **et** reportée dans le baseline de référence.

## Déploiement des services

```bash
# Edge Function (après configuration de BREVO_API_KEY,
# BREVO_SENDER_EMAIL et BREVO_SENDER_NAME)
supabase functions deploy notify-email

# Orchestrateur
cd orchestrator && npm ci && npm run build && npm start

# Frontend : VITE_* doit être présent avant le build
npm ci && npm run build
```

L'orchestrateur valide sa configuration au démarrage. En production, renseigner
au minimum `SUPABASE_DB_URL`, `APP_URL`, `CORS_ALLOWED_ORIGINS` et la
vérification des sessions humaines : `SUPABASE_JWT_SECRET` (projets legacy,
jetons HS256) **ou** `SUPABASE_JWKS_URL` (projets migrés vers les « JWT signing
keys », jetons ES256 — cas du projet `xucmfdggetwxmpquqjvj` : sans cette
variable, approve/reject/reset et le CRUD de nœuds échouent en 401). Ajouter
`SUPABASE_SECRET_KEY` (préférée) ou le repli legacy
`SUPABASE_SERVICE_ROLE_KEY` si `EMAIL_EDGE_FUNCTION_URL` est configurée. La SPA requiert
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et l'URL publique de l'orchestrateur.

## Contrôles post-déploiement

- `GET /healthz` de l'orchestrateur répond `{ "ok": true }`.
- Les advisors Supabase ne signalent aucune table sans RLS.
- L'origine exacte de la SPA est incluse dans `CORS_ALLOWED_ORIGINS`.
- Un compte viewer reçoit un refus sur les écritures ; une clé API technique ne
  peut pas approuver une étape humaine.
- Le service d'authentification du projet Supabase répond :
  `GET <VITE_SUPABASE_URL>/auth/v1/health` sans clé rend **401** (service vivant,
  clé exigée) ; un échec de résolution DNS ou un code 000 signale un projet en
  pause ou injoignable.

## Surveiller la disponibilité de Supabase

Le 03/10/2026, l'hôte du projet Supabase a cessé de résoudre pendant plusieurs
heures : personne ne pouvait plus se connecter, et l'écran de connexion
attribuait la panne au réseau de l'utilisateur. Depuis, l'écran de connexion
sonde `/auth/v1/health` à l'affichage et annonce une indisponibilité du service,
distincte d'un refus d'identifiants (`src/components/auth/serviceSante.ts`,
`src/components/auth/authErrors.ts`).

Cette sonde ne prévient que l'utilisateur qui ouvre l'écran. Pour être alerté
avant lui, contrôler la même route depuis le serveur :

```bash
getent hosts <ref>.supabase.co && curl -s -o /dev/null -w '%{http_code}\n' https://<ref>.supabase.co/auth/v1/health
```

Un projet du plan gratuit peut être mis en pause pour inactivité : sa
réactivation se fait depuis le compte propriétaire du projet.
