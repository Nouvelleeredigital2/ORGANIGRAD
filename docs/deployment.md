# Déploiement

## Pré-requis
- Projet Supabase (Postgres 15+), Auth activée.
- Secrets configurés (cf. `docs/security/secrets-management.md`).

## 1. Base de données — migrations
```bash
supabase link --project-ref <ref>
supabase db push           # applique supabase/migrations/* dans l'ordre
```
- Base **vierge** → appliquer `init_schema` + `rls` + `notifications_idempotency`.
- Base **déjà durcie** (RLS + policies en place) → appliquer uniquement
  `…_reconcile_p2_p5_*.sql` (les autres dupliqueraient les policies).
- Vérifier ensuite les *advisors* sécurité (dashboard ou MCP) et qu'aucune table
  n'est sans RLS.

## 2. Edge Function
```bash
supabase functions deploy notify-email
# secrets : RESEND_API_KEY, EMAIL_FROM (SUPABASE_URL / SERVICE_ROLE_KEY injectés)
```

## 3. Orchestrateur
```bash
cd orchestrator && npm ci && npm run build
# env requis : SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_EDGE_FUNCTION_URL,
#              SLACK_*, APP_URL, CORS_ALLOWED_ORIGINS
npm start                  # node dist/api/bootstrap.js (validation env au boot)
```
La validation `config/env.ts` fait échouer le démarrage si la config est invalide.

## 4. Frontend
```bash
npm ci && npm run build    # → dist/ (servir en statique : Vercel, nginx…)
# env : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ORCHESTRATOR_URL
```

## Procédure de rollback
- **Code** : `git revert <merge-commit>` (ou redeploy du tag précédent).
- **Migrations** : chaque fichier `supabase/migrations/*` contient un bloc de
  rollback commenté. Les changements additifs (colonnes `if not exists`, index)
  sont sûrs ; pour RLS, désactiver/retirer les policies ajoutées via le bloc fourni.
- **Edge Function** : redeploy de la version précédente.

## Checklist post-déploiement
- `select 1` répond (projet non en pause).
- `GET /healthz` orchestrateur = `{ ok: true }`.
- Advisors Supabase : 0 table sans RLS.
- Une clé API agent **ne peut pas** approuver (403).
- `GET /api/graph` ne contient aucun secret.
- CORS limité aux origines attendues.
