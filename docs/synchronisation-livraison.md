# Synchronisation et livraison

Ce runbook couvre la livraison contrôlée de l'application. Une livraison n'est
validée que lorsque les contrôles automatisés et la recette connectée sont
consignés sur l'environnement de staging.

## 1. Synchroniser les branches

La branche de travail est `feat/synapse-consumer-pg`. Les corrections de l'audit
organigramme A-01 à A-04 sont dans `codex/audit-fixes` (commit `a1d059c`). Elles
doivent être intégrées par revue dans la branche de travail, puis par pull request
vers `master`. Ne pas fusionner depuis `.worktrees/audit-fixes`.

```powershell
$repo = 'C:\Users\5070 Ti\Downloads\---APPLICATION-2026---\ORGANIGRAD'
git -C $repo fetch origin
git -C $repo status --short
git -C $repo diff --stat feat/synapse-consumer-pg...codex/audit-fixes
git -C $repo switch feat/synapse-consumer-pg
git -C $repo merge --no-ff codex/audit-fixes -m 'merge: corrections audit organigramme'
git -C $repo push origin feat/synapse-consumer-pg
```

Ouvrir ensuite une pull request `feat/synapse-consumer-pg` vers `master`. Après
revue, CI et recette, poser un tag immuable :

```powershell
git tag -a vYYYY.MM.DD -m 'Organigrad release vYYYY.MM.DD'
git push origin vYYYY.MM.DD
```

## 2. Vérification avant intégration

Exécuter ces commandes dans un répertoire propre, sans secrets de production :

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
Push-Location orchestrator
npm ci
npm run check
Pop-Location
```

Pour la couverture PostgreSQL réelle, démarrer une base locale jetable puis lancer
la suite dédiée décrite dans [`testing.md`](./testing.md). Les tests B2/B5 du bus
restent non exécutés tant que les secrets du projet de test ne sont pas injectés ;
consigner explicitement leur exécution ou leur statut.

## 3. Synchroniser Supabase et les variables

Avant toute commande de base, vérifier la cible :

```powershell
supabase login
supabase link --project-ref <staging-project-ref>
supabase migration list
```

Les migrations avant le 2026-08-03 sont historiques et non rejouables. La règle
complète est dans [`../supabase/migrations/README.md`](../supabase/migrations/README.md).

- Pour un projet neuf, appliquer le baseline de référence avec un DSN détenu par
  le coffre, puis pousser uniquement les migrations postérieures au baseline :

  ```powershell
  psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema/baseline_2026-08-03.sql
  supabase db push
  ```

- Pour une base existante, ne jamais rejouer le baseline ni les migrations
  historiques. Après comparaison de `supabase migration list`, pousser seulement
  une migration inédite, revue et sauvegardée.

- Toute migration nouvelle est idempotente, comporte une procédure de retour
  arrière testée sur staging et met aussi à jour le baseline. Les corrections
  A-01 à A-04 ne comportent pas de migration.

| Cible | Variables minimales |
| --- | --- |
| SPA (au build) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ORCHESTRATOR_URL` |
| Orchestrateur | `SUPABASE_DB_URL`, `SUPABASE_JWT_SECRET`, `APP_URL`, `CORS_ALLOWED_ORIGINS` |
| E-mail | `EMAIL_EDGE_FUNCTION_URL`, `SUPABASE_SERVICE_ROLE_KEY`; secrets Edge `RESEND_API_KEY`, `EMAIL_FROM` |
| Intégrations optionnelles | `SLACK_VALIDATIONS`, `SLACK_FLUX`, `INTEGRATION_ENCRYPTION_KEY`, `SYNAPSE_URL` |

Ne jamais exposer DSN, service role, JWT secret, clés de chiffrement ni webhooks
dans une variable `VITE_*`, un ticket, une capture ou un journal. Les règles de
rotation sont dans [`security/secrets-management.md`](./security/secrets-management.md).

Déployer la fonction après avoir configuré ses secrets :

```powershell
supabase functions deploy notify-email
```

## 4. Recette connectée de staging

Créer un workspace de test et quatre comptes distincts : `owner`, `admin`,
`member`, `viewer`. Utiliser un CSV de plusieurs personnes et une clé API
technique limitée à `graph:read,node:read,execution:read,node:run`.

| Rôle ou parcours | Résultat attendu |
| --- | --- |
| Owner | importe un CSV, exporte des données non vides, invite les trois autres rôles, crée puis révoque une clé API. |
| Admin | modifie une fiche CSV et conserve toutes les autres; supprime une fiche et ne la retrouve pas après rechargement. |
| Member | modifie une fiche autorisée; sa tentative de suppression est refusée par RLS. |
| Viewer | lit l'organigramme; toute écriture est refusée. |
| Invitation | création, copie, acceptation par un autre compte, révocation et expiration sont cohérentes. |
| Orchestration | exécution IA, attente HITL, approbation/rejet/reset par session humaine, transition SSE dans un second onglet. |
| Clé API | lit/exécute selon ses scopes mais reçoit 403 sur approve/reject/reset humain. |

Rejouer A-01 (exports indisponibles sans donnée), A-02 (première édition CSV sans
perte), A-03 (première suppression CSV persistée) et A-04 (erreur d'écriture sans
toast de succès). Conserver l'URL de staging, l'horodatage, l'identité de test et
le résultat de chaque cas dans la pull request ou le journal de recette.

Après déploiement, vérifier `GET /healthz`, les advisors Supabase, le CORS depuis
l'origine SPA réelle et l'absence de secrets dans `GET /api/graph`.

## 5. Retour arrière

Préparer une sauvegarde et une restauration testée sur staging avant toute migration
de production. Ne jamais utiliser `supabase db reset`, `DROP SCHEMA` ou un dump
contre la production pendant un rollback applicatif.

```powershell
# Retour arrière du code après un merge de pull request
git revert -m 1 <merge-commit>
git push origin master

# Retour à une fonction Edge connue
git checkout <release-tag> -- supabase/functions/notify-email
supabase functions deploy notify-email
```

Pour une migration, appliquer exclusivement le rollback explicitement documenté
dans cette migration, après validation sur staging. Préserver les changements
additifs pendant la fenêtre de rollback afin que frontend et orchestrateur restent
compatibles avec les deux versions. Après rollback, contrôler `/healthz`, une
connexion utilisateur, les politiques RLS, une transition orchestrée et les logs.
