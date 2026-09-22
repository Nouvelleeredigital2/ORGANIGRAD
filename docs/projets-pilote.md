# Projets et tâches — pilote local du 9 septembre 2026

## Ce qui est ajouté

Un espace contient des projets persistants, et chaque projet contient ses tâches.
Un nœud d'orchestration n'est pas une tâche. Aucun catalogue de démonstration ni
transfert automatique depuis les brouillons `localStorage` n'est ajouté.

Les membres actuels de l'espace peuvent consulter ces données. Les rôles owner,
admin et member peuvent créer et modifier ; viewer reste en lecture seule.
Un administrateur d'un autre espace n'obtient aucun accès implicite.

## Utilisation après activation qualifiée

1. Se connecter dans Organigrad et sélectionner l'espace voulu.
2. Ouvrir **Projets**, puis **Nouveau projet**. Saisir le nom et la description.
3. Dans le projet, ajouter **Nouvelle tâche** : titre, description, état,
   responsable actuel de l'espace et échéance facultative.
4. Modifier les tâches, puis **Actualiser** ou recharger la page pour les relire.
5. **Archiver** demande confirmation et conserve les données ; cocher **Afficher
   les éléments archivés** pour les retrouver et les restaurer. Un projet archivé
   verrouille ses tâches jusqu'à sa restauration.

Chaque formulaire garde le même identifiant lors d'une nouvelle tentative après
une réponse perdue. Un contenu différent sous cet identifiant produit un conflit.
Une modification exige la version lue : un autre changement impose une relecture,
pas un écrasement silencieux. Changer de compte, de session ou d'espace ferme les
formulaires et invalide les réponses précédentes.

Un rafraîchissement de vérification dans la même session et le même espace
conserve le brouillon. Les écritures attendent la confirmation des droits ; une
erreur propose de revérifier l'accès sans effacer la saisie.

Le pilote refuse de présenter des listes tronquées comme complètes. Les listes
client sont paginées et bornées ; dépasser la limite affiche une erreur explicite.

## Stockage proposé, non appliqué à distance

Migration : `supabase/migrations/20260909090010_projects_and_tasks.sql`.

- Ajoute seulement `public.projects`, `public.project_tasks`, leurs contraintes,
  index, RLS et deux triggers non privilégiés.
- Aucun seed, modification du graphe, compte créé, extension moteur ou nouveau jeton.
- La SPA utilise le client Supabase actuel, un Bearer lié à la session capturée et
  les contrôles de la base. Aucun stockage local des projets/tâches en secours.
- UPDATE transmet `version = version_lue + 1` et filtre la version lue ; un UPDATE
  sans version suivante explicite est refusé même par la Data API directe.
- La suppression physique n'est pas accordée aux sessions ; ce lot expose l'archivage.
- Le schéma de référence extrait de production n'est pas modifié pour prétendre
  que ces tables y existent déjà. Actualiser son miroir après application et
  introspection qualifiées, pas avant.

## Lecture API du producteur

Routes opt-in de l'orchestrateur :

- `GET /api/projects?limit=25&cursor=…` : projets du workspace courant, curseur
  opaque facultatif ; maximum 100 par page, archives comprises.
- `GET /api/projects/:projectId/context` : projet, compteurs des tâches actives,
  `workspaceMemberCount` (membres de l'espace, pas membres supposés du projet),
  jusqu'à dix dernières tâches modifiées réellement présentes.

Bearer **utilisateur Organigrad** et `X-Workspace-Id` obligatoires. Les anciennes
clés techniques `ok_…` sont refusées ici ; un JWT LINK n'est pas interchangeable.
Le producteur relit l'appartenance et applique des délais SQL. Réponses privées
non mises en cache ; refus, introuvable et panne ont des résultats distincts.
Cette activité n'est pas un journal exhaustif des événements passés.

## Activation et retour arrière à préparer

Réglages nouveaux, désactivés dans les exemples :

- serveur : `PROJECTS_ENABLED=false` ; `true` exige Postgres et un vérificateur de sessions ;
- interface : `VITE_PROJECTS_ENABLED=false`, réglage de construction.

Le serveur sans base ne fournit pas de faux projets en mémoire. Activer les deux
réglages seulement après qualification du SQL, de la session, de l'origine CORS
et des versions servies. Le réglage masque les surfaces applicatives, il n'est
pas un mécanisme de révocation des permissions Data API après migration.

Avant production : vérifier le projet réellement servi (référence documentaire
`xucmfdggetwxmpquqjvj`, à confronter au runtime et au connecteur), les tables déjà
présentes et l'historique ; obtenir l'accord regroupé sur cette migration exacte,
les artefacts immuables, sauvegardes et services redémarrés. Ne pas lancer un
`db push` global ni rejouer la baseline historique. En cas d'échec, désactiver
les surfaces et rétablir les versions applicatives précédentes ; conserver les
nouvelles tables et les données au lieu de restaurer aveuglément une ancienne base.

## Ce que ce lot ne valide pas encore

La liaison espace LINK → projet Organigrad et la délégation personnelle restent
à construire avant d'alimenter le panneau LINK. Pas de rapprochement par nom ou
e-mail, pas de jeton partagé et pas de transmission libre d'un UUID comme preuve
d'autorisation. Le MCP projets doit réutiliser les mêmes contrôles une fois son
contrat qualifié ; les deux routes ci-dessus ne prétendent pas le remplacer.

Les tests locaux ne certifient ni Supabase distant, ni le déploiement, ni un
téléphone physique. La livraison Mémoire Vive V5 / le pilote mémoire restent des
lots séparés du plan réseau.

Résultats et commandes : [preuves locales](plans/2026-09-09-projets-preuves.md).
