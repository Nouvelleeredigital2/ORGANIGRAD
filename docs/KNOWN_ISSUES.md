# Problèmes connus

État observé le 23 septembre 2026. Les éléments historiques non reproduits ne sont pas repris ici.

## KI-004 — Chiffrement au repos optionnel

- Sévérité : élevée si des prompts ou webhooks sensibles sont stockés sans clé.
- Impact : `SecretCipher` est utilisé par le store PostgreSQL, mais l’absence de `INTEGRATION_ENCRYPTION_KEY` conserve les valeurs en clair et n’empêche pas le démarrage PostgreSQL.
- Validation production : non effectuée.

## KI-005 — Branche locale en retard et worktree sale

- Sévérité : opérationnelle.
- État : `master` est derrière `origin/master` de 7 commits et contient des modifications documentaires préexistantes.
- Impact : risque de documenter ou modifier une base dépassée ; toute synchronisation doit préserver les changements locaux.

## KI-006 — Chunks frontend volumineux

- Sévérité : secondaire/performance.
- Build : `vendor-pdf` ~540 kB et `vendor-xlsx` ~500 kB minifiés déclenchent l’avertissement Vite.
- Impact réel : non mesuré dans un navigateur ou réseau contraint.

## Résolus le 23 septembre 2026

- **KI-001** : `.env.test` définit désormais `VITE_ORCHESTRATOR_URL=` ; la suite hors ligne passe 47/47 sans override malgré la configuration locale.
- **KI-002** : les deux configurations Vitest limitent les suites à un worker sans modifier le timeout de 10 s ; deux passages consécutifs réussissent pour chaque package.
- **KI-003** : `.worktrees/**` est exclu globalement et `npm run lint` réussit.
