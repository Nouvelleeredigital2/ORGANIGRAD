# Remédiation de l’audit — Design

**Décision validée :** corriger les défauts fonctionnels, de sécurité et de
déploiement relevés le 26 août 2026, sans supprimer les configurations locales
ni les worktrees existants.

## Approche retenue

1. Restaurer les comportements frontend par des régressions Playwright : la
   vue Orchestration reste disponible si la source RH échoue et le résultat
   d’un export PDF reste lisible après le téléchargement.
2. Remplacer la version vulnérable de SheetJS par le tarball 0.20.3 déjà
   vérifié, versionné dans `vendor/`, afin de conserver une installation CI
   reproductible.
3. Rendre le Dockerfile de l’orchestrateur reproductible et hermétique : copier
   les dépendances vendorisées avant `npm ci`, et exclure secrets et artefacts
   du contexte Docker.
4. Nettoyer uniquement les journaux et artefacts régénérables datés ; jamais
   les `.env`, `node_modules`, `dist`, `test-results` ou worktrees actifs sans
   une demande distincte.

## Critères d’acceptation

- Les nouvelles régressions échouent avant les correctifs puis passent.
- `npm audit --omit=dev --audit-level=high` ne signale aucun high/critical.
- La politique d’audit ne contient plus d’acceptation `xlsx` devenue inutile.
- Le Dockerfile de l’orchestrateur copie `vendor/` avant l’installation et son
  `.dockerignore` exclut toutes les configurations `.env`.
- Les contrôles frontend, orchestrateur et E2E hermétiques restent verts.
