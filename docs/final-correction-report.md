# Rapport final de correction — Organigrad

## 1. Résumé exécutif
Audit et durcissement complets de l'application (SPA + orchestrateur + Supabase).
L'application est passée d'un état « compile mais comporte des failles critiques »
à un état **sécurisé, testable et exploitable** : moteur d'orchestration réellement
asynchrone, autorisation par scopes, RLS, protection SSRF, notifications durcies,
DTO publics, SSE par ticket, CORS allowlist, tests hermétiques, lint propre, imports
bornés, accessibilité, bundle réduit, migrations versionnées et appliquées, audit
log, rate-limiting, CI et documentation.

## 2. État avant
- Casts `as never` masquant l'incompatibilité moteur (sync) ↔ store Postgres (async).
- Clé API technique capable d'`approve/reject` (contournement HITL).
- Clé permanente dans l'URL SSE ; CORS `origin: true`.
- `GET /api/graph` exposant prompts/URL MCP/webhooks.
- SSRF possible via URLs MCP/webhooks ; Edge `notify-email` = relais ouvert.
- Tests non hermétiques ; ~33 problèmes ESLint ; bundle ~1,48 Mo ; schéma non versionné.

## 3. État après
- 0 cast dangereux ; moteur entièrement asynchrone et transactionnel.
- Scopes appliqués ; agent incapable d'approuver ; RLS active partout.
- SSE par ticket à usage unique ; CORS allowlist.
- DTO publics ; SSRF bloquée ; relais email fermé (auth + destinataire restreint).
- Tests hermétiques ; ESLint 0 ; bundle d'entrée ~68 kB ; migrations appliquées.

## 4. Phases réalisées
P0 secrets · P1 moteur async · P2 scopes · P3 RLS/multi-tenant · P4 SSRF/SSE/CORS ·
P5 notifications · P6 DTO · P7 SSE/CORS · P8 tests hermétiques · P9 lint/deps ·
P10 import/export · P11 a11y · P12 bundle. Deltas complémentaires : validation env,
CI, docs, audit log, rate-limiting, jest-axe.

## 5. Fichiers créés (sélection)
`orchestrator/src/api/{scopes,dto,sseTickets}.ts`, `orchestrator/src/net/ssrfGuard.ts`,
`orchestrator/src/observability/{notificationContract,auditLog,rateLimiter}.ts`,
`orchestrator/src/config/env.ts`, `orchestrator/.env.example`,
`src/services/sheetSecurity.ts`, `src/hooks/useFocusTrap.ts`, `src/design/cx.ts`,
`src/contexts/WorkspaceProvider.tsx`, `src/origin/OriginProvider.tsx`,
`src/components/auth/inviteToken.ts`, `public/favicon.svg`,
`supabase/migrations/*.sql` (4), `.github/workflows/ci.yml`, `docs/**`, + suites de tests.

## 6. Fichiers modifiés (sélection)
`engine.ts`, `graphStore.ts`, `pgGraphStore.ts`, `auth.ts`, `pgServer.ts`,
`mcpServer.ts`, `mcpClient.ts`, `notifier.ts`, `bootstrap.ts`, `App.tsx`,
`orchestratorService.ts`, `useOrchestratorBridge.ts`, `hybridNodeStore.ts`,
`hybridNodeRepo.ts`, `OrchestrationView.tsx`, `BaseModal.tsx`, `ui.tsx`,
`index.html`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, README, etc.

## 7. Corrections critiques
- Moteur ↔ store asynchrone (casts `as never` supprimés ; `await` complet ; écritures
  attendues avant réponse ; transaction + `SELECT FOR UPDATE` anti double-exécution).
- Scopes : une clé technique ne peut pas approuver/rejeter (tests négatifs).

## 8. Corrections de sécurité
SSRF (`ssrfGuard`) · DTO publics · ticket SSE · CORS allowlist · Edge `notify-email`
(auth caller + destinataire restreint + idempotence) · `res.ok` réel · audit log ·
rate-limiting · secrets non versionnés + validation env.

## 9. Corrections d'architecture
Interface `GraphStore` async unique · machine à états centralisée · cache front
namespacé par workspace + états stale · source de vérité documentée (`docs/architecture/data-flow.md`).

## 10. Corrections frontend
A11y (lang, titre, favicon, modales role/aria/focus-trap/Échap, labels, `type=button`,
`100dvh`) · lazy-load des vues + manualChunks · import dynamique xlsx · cloisonnement
des caches.

## 11. Migrations ajoutées
`20260617120000_init_schema` · `20260617130000_rls` · `20260617140000_notifications_idempotency`
· `20260618000000_reconcile_p2_p5_*` (appliquée en prod) · `20260618130000_audit_log`
(appliquée en prod).

## 12. Tests ajoutés
engineAsyncStore, ssrfGuard, sseTickets, notificationContract, env, auditLog,
rateLimiter, hermetic (orchestrateur) ; sheetSecurity, BaseModal, hermetic, a11y
(jest-axe) (frontend) ; + adaptations des suites existantes.

## 13. Résultats exacts des commandes
```
Orchestrateur : tsc --noEmit → exit 0 ; vitest → 167 passed (16 files)
Frontend      : eslint . → exit 0 ; tsc -b → exit 0 ; vitest → 98 passed (27 files)
                vite build → OK ; npm audit → 2 (xlsx high, esbuild low)
Supabase      : migrations P2/P5 + audit_log appliquées ; advisors → 0 table sans RLS
```

## 14. Nombre de tests réussis
Orchestrateur **167** · Frontend **98** (total **265**).

## 15. Vulnérabilités npm restantes
- `xlsx` **HIGH** (prototype pollution / ReDoS) — **pas de correctif npm** ; atténué
  côté app (limites d'import + import dynamique). Recommandé : build SheetJS CDN ou
  remplacement.
- `esbuild` **LOW** — dev-server Windows uniquement ; correctif bloqué par un bump majeur.

## 16. Taille du bundle avant/après
Chunk d'entrée : **1 476 kB → 68 kB** (gzip 454 → 20 kB). Libs lourdes (recharts,
xlsx, jspdf) chargées à la demande / en chunks vendor distincts.

## 17. Actions manuelles restantes
- Activer *Leaked Password Protection* (dashboard Supabase).
- Décider de la stratégie de chiffrement des secrets d'intégration au repos.
- Brancher un test d'intégration PostgreSQL réel (Testcontainers) — cf. `docs/testing.md`.

## 18. Secrets à renouveler (sans valeurs)
Si une archive (`organigrad.zip`) ou un `.env` a été partagé : mot de passe Postgres,
clé `service_role` Supabase, et **les deux webhooks Slack**. Aucun secret n'est versionné.

## 19. Risques résiduels
| Problème | Gravité | Fichier | Raison du report | Correction recommandée | Risque métier |
|---|---|---|---|---|---|
| Validation humaine par scope seul (pas de JWT vérifié côté orchestrateur) | Moyen | `orchestrator/src/api/auth.ts` | Chantier auth + frontend | Vérifier le JWT Supabase + rôle `workspace_members` pour `approve/reject` | Une clé à scope humain (non émise aux agents) pourrait approuver sans session |
| CVE `xlsx` | Élevé | `package.json` | Pas de fix npm | Build SheetJS CDN ou remplacement | Fichier XLSX hostile (atténué par limites + import dynamique) |
| Pas de test d'intégration PG réel | Moyen | `orchestrator/tests/*` | Infra Docker indisponible ici | Testcontainers | Régression possible non couverte sur le vrai Postgres |
| Secrets d'intégration non chiffrés au repos | Moyen | DB | Stratégie de clé à décider | Chiffrement centralisé (KMS/env) | Lecture DB = lecture des secrets |
| DNS rebinding | Faible | `ssrfGuard.ts` | Hors périmètre initial | Pinning d'IP entre résolution et connexion | SSRF avancée |

## 20. Procédure de déploiement
Voir `docs/deployment.md` (migrations → Edge Function → orchestrateur → frontend +
checklist post-déploiement).

## 21. Procédure de rollback
- **Code** : `git revert <merge-commit>` ou redeploy du tag précédent.
- **Migrations** : bloc de rollback commenté dans chaque fichier `supabase/migrations/*`
  (changements additifs sûrs ; pour RLS, retirer les policies ajoutées).
- **Edge Function** : redeploy de la version précédente.
