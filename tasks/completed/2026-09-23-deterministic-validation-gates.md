# Portes de validation locales déterministes

## Statut

VALIDÉ le 23 septembre 2026.

## Changements

- `.env.test` neutralise explicitement l’URL de l’orchestrateur en plus de Supabase.
- `eslint.config.js` exclut `.worktrees/**`.
- les configurations Vitest frontend et orchestrateur utilisent un worker ; le timeout reste à 10 secondes ;
- `src/test/hermetic.test.ts` protège l’environnement E2E et l’exclusion ESLint contre les régressions.

## Preuves

- cycle rouge/vert confirmé pour les deux nouveaux tests de garde ;
- `npm run lint`, typechecks et builds réussis ;
- frontend : deux passages consécutifs à 500/500 ;
- orchestrateur : deux passages consécutifs à 719/719 exécutés, 63 tests live ignorés conformément à leur configuration ;
- Playwright hors ligne : 47/47 sans override shell ;
- aucun test supprimé, ignoré ou assoupli ; aucun timeout augmenté.

## Limites

- les suites PostgreSQL en conteneur, Supabase connectées et intégrations externes ne faisaient pas partie de cette tâche et n’ont pas été rejouées ;
- la branche `master` reste derrière `origin/master` de sept commits et porte des modifications locales à préserver.
