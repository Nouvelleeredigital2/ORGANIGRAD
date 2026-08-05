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
# Edge Function (après configuration de RESEND_API_KEY et EMAIL_FROM)
supabase functions deploy notify-email

# Orchestrateur
cd orchestrator && npm ci && npm run build && npm start

# Frontend : VITE_* doit être présent avant le build
npm ci && npm run build
```

L'orchestrateur valide sa configuration au démarrage. En production, renseigner
au minimum `SUPABASE_DB_URL`, `SUPABASE_JWT_SECRET`, `APP_URL` et
`CORS_ALLOWED_ORIGINS`; ajouter `SUPABASE_SERVICE_ROLE_KEY` si
`EMAIL_EDGE_FUNCTION_URL` est configurée. La SPA requiert
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et l'URL publique de l'orchestrateur.

## Contrôles post-déploiement

- `GET /healthz` de l'orchestrateur répond `{ "ok": true }`.
- Les advisors Supabase ne signalent aucune table sans RLS.
- L'origine exacte de la SPA est incluse dans `CORS_ALLOWED_ORIGINS`.
- Un compte viewer reçoit un refus sur les écritures ; une clé API technique ne
  peut pas approuver une étape humaine.
