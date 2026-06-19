# Gestion des secrets

## Où placer les secrets
- **SPA** : `.env.local` (jamais committé). Seules les variables `VITE_*` sont
  exposées au navigateur — n'y mettre **que** des valeurs publiques (URL projet,
  clé `anon`/publishable). Jamais de `service_role` ni de secret serveur.
- **Orchestrateur** : `orchestrator/.env` (jamais committé). Contient les secrets
  serveur (`SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, webhooks Slack).
- **Edge Functions / Supabase** : secrets configurés dans le dashboard Supabase
  (`RESEND_API_KEY`, `EMAIL_FROM`, `SUPABASE_SERVICE_ROLE_KEY` injecté).

Les fichiers `.env*` sont ignorés par Git (sauf `.env.example` / `.env.test`).
Validation centralisée au démarrage : `orchestrator/src/config/env.ts` fait
échouer le boot avec un message clair (noms de variables seulement, jamais les
valeurs) si une variable requise manque ou est invalide.

## Variables (voir `.env.example`)
| Variable | Service | Sensible |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | SPA | non (publiques) |
| `SUPABASE_DB_URL` | orchestrateur | **oui** |
| `SUPABASE_SERVICE_ROLE_KEY` | orchestrateur / edge | **oui** |
| `SLACK_VALIDATIONS` / `SLACK_FLUX` | orchestrateur | **oui** |
| `RESEND_API_KEY` | edge `notify-email` | **oui** |

## Rotation
1. Générer la nouvelle valeur dans le dashboard du service (Supabase / Slack / Resend).
2. Mettre à jour `orchestrator/.env` (ou les secrets Supabase) puis redémarrer.
3. Révoquer l'ancienne valeur.

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
