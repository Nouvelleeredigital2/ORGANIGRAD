# Projets : source de livraison et parcours Synapse — 13 septembre 2026

## Sources vérifiées

Lecture fraîche après `git fetch origin`, sans intervention distante applicative.

| Source | Révision | Constat |
|---|---|---|
| `master` local | `6b7822b` | Ancienne copie ; absence des écrans projets ne décrit pas le dépôt distant. Modifications documentaires locales laissées intactes. |
| `origin/master` | `37f38dc` | Contient déjà les projets et accès personnels (PR 23), bots (PR 24), présence (PR 26) et empaquetage (PR 28). |
| `integrate/equipes-presence-20260912` | `febb72e` | Contient les deux sources précédentes, puis circuits, import des personas en brouillon et correction de session. |
| Candidat front-end | `feat/projects-frontend-20260913` | Dérive directement de `febb72e`, sans nouvelle fusion ni sélection partielle de fichiers. |

`git merge-base --is-ancestor` confirme que le master local et le master distant sont tous deux ancêtres de `febb72e`. Il n'existe donc pas de correctif plus récent de ces masters à réappliquer au candidat au moment du relevé. Ce constat remplace toute conclusion basée uniquement sur le vieux master local. Il ne prouve ni l'image déployée ni les migrations en base.

## Contrat de navigation conservé

- Création depuis Synapse : ouvrir l'origine OrganiGrad qualifiée par le serveur avec `/?v=projects`. L'utilisateur choisit son espace accessible, puis le formulaire existant « Nouveau projet ».
- Consultation : `/?v=projects&workspace=<uuid>&project=<uuid>`. Le routeur conserve les invitations et paramètres inconnus. L'écran vérifie le format des identifiants, l'appartenance à l'espace et le projet effectivement chargé.
- Un espace du lien différent de l'espace actif nécessite la sélection explicite de l'espace accessible ; aucun rapprochement par nom.
- `VITE_PROJECTS_ENABLED=true` active navigation et écran. `VITE_PRIVATE_PROJECTS_ENABLED=true` active en plus les accès personnels. Ce sont des paramètres de build, pas une autorisation de déploiement.
- OrganiGrad conserve les projets/tâches, Synapse leurs associations : aucune seconde création de projet côté Synapse.
- L'accès personnel `projects:read` reste une consultation liée à la session, distincte des autorisations de service ou d'équipe. Son secret est gardé uniquement en mémoire du panneau.

## Ajustements de présentation

L'écran explique où créer le projet et où associer les applications. Le panneau Synapse décrit son accès personnel en langage courant ; les identifiants et le nom du droit restent accessibles dans « Détails de connexion ». Aucun secret n'est déplacé vers les URL, le presse-papiers ou un stockage navigateur.

## Vérifications

- Avant et après changement : 121 tests passent dans `ProjectsView`, `projectsRoute`, `projectRepo` et `privateProjectTokens`.
- TypeScript du front-end : réussi.
- ESLint ciblé et `git diff --check` : réussis. Build Vite par défaut réussi (projets désactivés par défaut, avertissement existant sur la taille de certains bundles).
- Build avec `VITE_PROJECTS_ENABLED=true` et `VITE_PRIVATE_PROJECTS_ENABLED=true` également réussi : le bundle `ProjectsView` inclut le véritable écran, pas seulement son message de désactivation.
- Les tests couvrent notamment changements d'utilisateur/espace/session/projet/rôle, réponse tardive, révocation, secret masqué et absence de persistance, double soumission, refus d'accès et liens de projets.
- Ces preuves sont locales avec services simulés. La recette connectée à deux utilisateurs/deux projets et le déploiement restent distincts ; aucune écriture SQL, configuration distante ou migration exécutée dans ce lot.
