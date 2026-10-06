# Gestion des secrets

## Où placer les secrets
- **SPA** : `.env.local` (jamais committé). Seules les variables `VITE_*` sont
  exposées au navigateur — n'y mettre **que** des valeurs publiques (URL projet,
  clé `anon`/publishable). Jamais de `service_role` ni de secret serveur.
- **Orchestrateur** : `orchestrator/.env` (jamais committé). Contient les secrets
  serveur (`SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY`, repli legacy temporaire,
  webhooks Slack).
- **Edge Functions / Supabase** : secrets configurés dans le dashboard Supabase
  (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`). Les nouvelles
  clés serveur sont fournies par Supabase dans `SUPABASE_SECRET_KEYS`.

Les fichiers `.env*` sont ignorés par Git (sauf `.env.example` / `.env.test`).
Validation centralisée au démarrage : `orchestrator/src/config/env.ts` fait
échouer le boot avec un message clair (noms de variables seulement, jamais les
valeurs) si une variable requise manque ou est invalide.

## Variables (voir `.env.example`)
| Variable | Service | Sensible |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | SPA | non (publiques) |
| `SUPABASE_DB_URL` | orchestrateur | **oui** |
| `SUPABASE_SECRET_KEY` | orchestrateur | **oui** |
| `SUPABASE_SERVICE_ROLE_KEY` | orchestrateur / edge | **oui** |
| `SLACK_VALIDATIONS` / `SLACK_FLUX` | orchestrateur | **oui** |
| `BREVO_API_KEY` | edge `notify-email` | **oui** |
| `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | edge `notify-email` | non secrets |

## Rotation
1. Créer une clé serveur dédiée `sb_secret_…` sans désactiver la clé legacy.
2. Ajouter la clé à l'Edge Function, puis à `orchestrator/.env` sous
   `SUPABASE_SECRET_KEY`; déployer la fonction et recréer l'orchestrateur.
3. Vérifier appel `apikey`, notification Brevo réelle, Auth Admin, SQL et santé.
4. Retirer `SUPABASE_SERVICE_ROLE_KEY` de l'orchestrateur, répéter les preuves,
   puis désactiver la clé legacy côté Supabase.
5. Tourner séparément le mot de passe PostgreSQL après inventaire de ses
   consommateurs ; ce mot de passe n'a pas de fenêtre de coexistence native.

## Révocation d'une clé API workspace
- UI *Clés API* → révoquer (`revoked_at = now()`, jamais de delete — audit).
- La clé complète n'est affichée qu'à la création ; seul le hash SHA-256 est stocké.
- Rotation : créer une nouvelle clé → migrer l'agent → révoquer l'ancienne.

## Secrets à renouveler manuellement (si jamais exposés)
Si une archive (`organigrad.zip`) ou un `.env` a été partagé : renouveler le mot de
passe Postgres, la clé `service_role` Supabase, et **régénérer les deux webhooks
Slack**. Ne jamais committer d'archive (`*.zip` est ignoré).

## Règles
- Ne jamais logguer un secret, une connection string, un token ou un webhook.
- Ne jamais renvoyer un secret dans une réponse HTTP (cf. DTO publics).
- Les messages d'erreur de validation n'affichent jamais les valeurs.
