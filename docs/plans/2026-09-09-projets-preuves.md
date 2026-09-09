# Projets Organigrad — preuves locales

## Périmètre et versions

Lot du 9 septembre 2026, branche `feat/projets-pilote-20260909`, base `4c333be`.
Ce reçu couvre le nouveau module Organigrad, pas la clôture du pilote réseau.

- `2f084b0` : conception additive confirmée, projets distincts des nœuds.
- `ff0c11a` : stockage projets/tâches, règles d'accès, tests SQL et persistance.
- `1b1aaaf` : routes API de lecture sous session utilisateur Organigrad.
- `df02ffd` : formulaires, navigation, archivage et contrôles de session.
- `cf2ac27` : hauteur naturelle de la barre mobile et messages dans le flux.
- `623212e` : correction de la cascade des styles chargés après la barre mobile.

Le checkout principal et ses huit fichiers documentaires déjà modifiés sont
conservés. Aucun push, merge, déploiement, migration distante, nouveau compte,
seed ou rotation de jeton n'est effectué dans ce lot.

## Vérifications enregistrées

| Vérification | Résultat | Portée |
|---|---|---|
| Suite orchestrator complète | 421 réussis, 62 ignorés, 0 échec | Les intégrations ignorées ne deviennent pas validées |
| SQL projets | 33 réussis, inclus ci-dessus | Migration réellement exécutée par PGlite local, rôles/RLS/contraintes |
| API sur SQL local | 6 réussis, inclus ci-dessus | Requêtes réelles ; vérification de session synthétique |
| Persistance sur disque | 1 réussi, inclus ci-dessus | Fermer/réouvrir le moteur, relire le projet et sa tâche modifiée |
| API Fastify | 79 réussis, inclus ci-dessus | Sessions, refus, délais, pagination, erreurs et DTO bornés |
| Suite frontend après corrections des brouillons et de la barre mobile | 354 réussis, 0 ignoré, 0 échec | Tests unitaires/composants, pas Supabase distant |
| TypeScript frontend et lint complet | Réussis | Sources réunies |
| Build serveur | Réussi | `npm run build` dans orchestrator |
| Build frontend avec flag projets | Réussi, 3 189 modules | Sans lecture de fichiers env ni variables VITE héritées |
| Chromium PC et viewport mobile | 2 réussis, 26,0 s, rejeu indépendant final | API HTTP simulée isolée, formulaires réels, non-chevauchement mesuré à 375 px |

Les rapports JSON bruts sont conservés localement dans
`reports/projets-backend-final.json` et `reports/projets-frontend-final.json`
(ignorés par Git). La suite navigateur et ses limites sont décrites dans
`e2e-projects/README.md` ; captures et audit réseau dans ses sorties ignorées.

## Corrections prouvées avant intégration

La relecture et les tests en échec ont notamment identifié puis corrigé :

- UPDATE sans version suivante explicite : risque d'écrasement ; maintenant refusé.
- Valeurs SQL limites : noms rembourrés d'espaces, dates infinies/hors plage.
- Rafraîchissement des appartenances : conservation du brouillon et de son UUID
  dans la même session/espace, écritures suspendues pendant la vérification.
- Changement réel de session/espace/rôle : démontage du formulaire, annulation
  des requêtes et rejet des réponses devenues obsolètes.

Les relectures finales des correctifs des brouillons et de la barre mobile n'ont
relevé aucun blocage concret. Les captures ont révélé un chevauchement de la barre
supérieure à 375 px : son message finissait à 119 px pour un titre commençant à
112 px. Le test navigateur reproduit ce défaut avant correction ; la barre
dispose maintenant d'une hauteur naturelle sous 1 024 px, sans changement des
actions d'import/export. Le premier correctif a encore échoué dans Chromium : une
seconde feuille régénérait les utilities Tailwind après `index.css`. Le correctif
suivant renforce seulement la spécificité des règles mobiles concernées. Les cinq
tests Topbar passent, dont celui du chargement tardif ; l'assertion navigateur est
restée inchangée et passe maintenant. Captures PC/mobile relues visuellement.

Le serveur de test possédé est arrêté après le rejeu final : le contrôle TCP sur
`127.0.0.1:5174` retourne `ECONNREFUSED`. L'avertissement de build sur le paquet PDF
de plus de 500 Ko demeure non bloquant ; aucune optimisation hors lot ajoutée.

## Reproduction sans Docker Desktop

Depuis la racine de cette copie de travail :

```powershell
npm test -- --reporter=json --outputFile=reports/projets-frontend-final.json
npm run lint
npx tsc -b
node node_modules/@playwright/test/cli.js test --config playwright.projects.config.ts
```

Depuis son sous-dossier `orchestrator` : `npm test` puis `npm run build`.
Ne pas substituer une base distante aux fixtures. Le lancement Playwright impose
le port local 5174 et refuse sa réutilisation s'il est occupé. Aucun serveur de
test n'est destiné à rester en arrière-plan.

## Ce qui n'est pas prouvé

- Connexion à Supabase réel : `get_project_url` refuse l'accès à la référence
  documentaire Organigrad `xucmfdggetwxmpquqjvj` (MCP -32600). Aucune migration tentée.
- Deux transactions concurrentes réellement simultanées : les tests couvrent la
  version obsolète, pas une mesure de course sur le serveur distant.
- Téléphone physique, Safari mobile, déploiement et session utilisateur réelle.
- Délégation Organigrad et liaison espace LINK → workspace/projet Organigrad.
- Route de contexte LINK raccordée, MCP projets et parcours mémoire livré.

Les accès techniques historiques ne remplacent pas une délégation personnelle.
Les réglages restent désactivés par défaut ; les commandes exactes de livraison
et les bases doivent être qualifiées avant l'accord opératoire regroupé.

## Données et nettoyage

Chaque scénario navigateur commence sans projet/tâche ; il saisit ses données
portant le préfixe `TEST-SYNAPSE` par les formulaires. Les données vivent uniquement dans la fixture
HTTP du processus de test, pas dans le produit. Les bases PGlite sont des fixtures
temporaires ; le test de persistance retire uniquement son répertoire temporaire
possédé et vérifié. Aucune donnée utilisateur ou compte n'est supprimé.
