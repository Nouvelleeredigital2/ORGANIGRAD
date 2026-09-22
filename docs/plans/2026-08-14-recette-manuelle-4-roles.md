# Recette manuelle — les quatre rôles + l'extérieur

Point 20 du plan de correction. À exécuter **après** B2 (projet de test
provisionné) et de préférence après un passage vert de
`npm run test:e2e:connected`.

Ce que l'automatisé ne remplace pas : un humain qui regarde si l'application
**dit la vérité**. Les tests vérifient qu'une action est refusée ; ils ne
vérifient pas qu'un message est compréhensible, ni qu'une commande proposée
tient sa promesse.

**Règle de lecture.** Un écran qui propose une action interdite est un défaut,
même si le serveur la refuse ensuite : proposer puis échouer est pire que ne pas
proposer. C'est le fil rouge de toute cette recette.

---

## 0. Préparation (une fois)

Quatre comptes sur le projet de test. Les trois premiers sont ceux de B2 ; il
faut en ajouter deux.

| Compte | Rôle | Comment l'obtenir |
|---|---|---|
| A | `owner` du workspace W | créé en B2 |
| B | extérieur à W | créé en B2 (a son propre workspace) |
| viewer | `viewer` dans W | créé en B2 |
| admin | `admin` dans W | à créer |
| member | `member` dans W | à créer |

Pour les deux derniers : créer le compte (Authentication → Add user,
**« Auto Confirm User » coché**), puis dans le SQL Editor, en remplaçant les
identifiants :

```sql
-- Rattacher au workspace de A avec le rôle voulu
insert into public.workspace_members (workspace_id, user_id, role)
values ('<WORKSPACE_W>', '<USER_ID>', 'admin');   -- puis 'member' pour l'autre

-- Retirer leur workspace personnel, sinon l'application les y connecte
-- (ils y sont owner) et la recette teste le mauvais workspace.
delete from public.workspaces where owner_id = '<USER_ID>';
```

Contrôle :

```sql
select u.email, w.name, m.role
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  join public.workspaces w on w.id = m.workspace_id
 order by m.role, u.email;
```

**Attendu** : A `owner`, admin `admin`, member `member`, viewer `viewer` — tous
dans W et **nulle part ailleurs**. B n'apparaît pas dans W.

Prévoir aussi un fichier CSV d'import (ou réutiliser celui d'un test) et une
adresse e-mail atteignable pour l'invitation.

---

## 1. Owner (compte A) — le parcours complet

Se connecter avec A.

| # | Action | Attendu |
|---|---|---|
| 1.1 | Connexion | l'application s'ouvre, le sélecteur de workspace affiche `owner` |
| 1.2 | Importer le CSV (Paramètres → fichier local) | aperçu, puis fiches visibles dans l'organigramme |
| 1.3 | Modifier une fiche (mode Édition → Profil → Enregistrer) | la modification tient **après rechargement** |
| 1.4 | Supprimer une fiche | disparaît, et les rattachements sont repris par le supérieur |
| 1.5 | Membres (`?v=members`) | la liste s'affiche, le formulaire d'invitation est présent |
| 1.6 | Inviter une adresse réelle | l'invitation apparaît en attente ; **l'e-mail arrive** |
| 1.7 | Copier le lien d'invitation, puis révoquer | l'invitation passe en révoquée et disparaît des invitations actives |
| 1.8 | Clés API (`?v=api-keys`) → créer | le token complet `ok_…` s'affiche **une seule fois** |
| 1.9 | Recharger la page | le token complet **n'est plus affiché**, seul le préfixe reste |
| 1.10 | Révoquer la clé | marquée révoquée, non réutilisable |
| 1.11 | Orchestration → créer un nœud, lancer | statut visible, journal d'activité alimenté |
| 1.12 | Amener un nœud en attente de validation | l'e-mail HITL **arrive** |
| 1.13 | Refuser, relancer, remettre en attente | un **second** e-mail arrive ⚠️ |
| 1.14 | Approuver depuis le Centre de validation | statut mis à jour, journal cohérent |
| 1.15 | Export PDF → Aperçu → Télécharger | fichier téléchargé, **ouvrable**, contenu correct |
| 1.16 | Export par lots | un fichier **par pôle**, tous ouvrables |

> ⚠️ **1.13 est le point le plus important de cette recette.** La clé
> d'idempotence ignorait l'occurrence : le second passage en attente ne
> prévenait plus personne. Corrigé, jamais vérifié de bout en bout.

> **1.15** : si le bouton « Télécharger le PDF » est hors de l'écran, note ta
> résolution. Le cas 1280×720 est corrigé, d'autres tailles n'ont pas été
> essayées.

---

## 2. Admin — mêmes droits d'administration

Se déconnecter, se connecter avec le compte `admin`.

| # | Action | Attendu |
|---|---|---|
| 2.1 | Sélecteur de workspace | affiche `admin` |
| 2.2 | Membres → inviter | **autorisé** |
| 2.3 | Modifier le rôle d'un `member` | **autorisé** |
| 2.4 | Retirer un membre | **autorisé**, sauf l'owner |
| 2.5 | Tenter de retirer l'owner | **refusé**, avec un message clair |
| 2.6 | Clés API → créer et révoquer | **autorisé** |
| 2.7 | Orchestration, HITL, export | **autorisé** |
| 2.8 | Modifier / supprimer une fiche | **autorisé** |

Si l'un des points 2.2 à 2.7 est refusé, l'admin n'a pas les droits attendus —
c'est un défaut.

---

## 3. Member — écrit, mais n'administre pas

| # | Action | Attendu |
|---|---|---|
| 3.1 | Sélecteur de workspace | affiche `member` |
| 3.2 | Modifier une fiche | **autorisé**, persiste après rechargement |
| 3.3 | Orchestration : créer un nœud, lancer | **autorisé** |
| 3.4 | Approuver / refuser une validation | **autorisé** |
| 3.5 | Réinitialiser un nœud | **autorisé** |
| 3.6 | `?v=members` | la page s'ouvre, mais **aucun formulaire d'invitation** et un message expliquant que son rôle ne le permet pas |
| 3.7 | `?v=api-keys` | idem : **aucune** commande de création, message explicite |
| 3.8 | Supprimer une fiche | **refusé** (réservé à l'administration) |

> **3.6 / 3.7** : les vues restent **adressables** — le routeur ne connaît pas
> les rôles, et il doit préserver `?invite=`. Ce qui compte est qu'elles
> n'offrent rien. Une page qui s'ouvre n'est pas un défaut ; un bouton qui
> apparaît en est un.

---

## 4. Viewer — lecture seule

| # | Action | Attendu |
|---|---|---|
| 4.1 | Sélecteur de workspace | affiche `viewer` |
| 4.2 | Consulter l'organigramme, ouvrir une fiche | **autorisé**, en lecture |
| 4.3 | Recherche / Spotlight (`⌘K`) | **autorisé** |
| 4.4 | Tableau de bord | **autorisé** |
| 4.5 | Chercher le mode Édition | **absent** |
| 4.6 | Forcer `?edit=1` dans l'URL | **aucun formulaire d'enregistrement** ; la fiche reste en lecture ⚠️ |
| 4.7 | `?v=members` et `?v=api-keys` | aucune commande, messages explicites |
| 4.8 | Orchestration | consultation possible, **aucune** commande lancer / approuver / refuser / réinitialiser |
| 4.9 | Export PDF | à décider : aujourd'hui autorisé (lecture). Noter si ce n'est pas voulu |

> ⚠️ **4.6 est un défaut corrigé pendant ce chantier** : `?edit=1` ouvrait les
> formulaires d'édition à un lecteur. La RLS refusait l'écriture, mais
> l'interface promettait une action vouée à un 403 muet. À revérifier à la main.

---

## 5. Utilisateur extérieur (compte B)

B n'est membre **d'aucun** workspace de A.

| # | Action | Attendu |
|---|---|---|
| 5.1 | Connexion avec B | arrive sur **son** workspace, vide |
| 5.2 | Le sélecteur de workspace | ne liste **pas** le workspace de A |
| 5.3 | Coller l'URL d'une fiche de A (`?agent=<id>`) | rien ne s'affiche ; pas de fuite de nom |
| 5.4 | `?v=members` / `?v=api-keys` | son propre workspace uniquement |
| 5.5 | Réutiliser une clé API créée dans le workspace de A | **refusée** |

> 5.3 et 5.5 sont la traduction visible de la faille corrigée. Les tests SQL et
> connectés les couvrent ; cette étape vérifie qu'aucun nom, aucune donnée ne
> transparaît à l'écran au passage.

---

## 6. Transversal — à faire à n'importe quel moment

| # | Action | Attendu |
|---|---|---|
| 6.1 | Deux onglets, changer de rôle dans l'un (par SQL) puis revenir sur l'autre | le second onglet **reprend le bon rôle** en redevenant actif |
| 6.2 | Couper le réseau pendant un enregistrement | message d'erreur clair, **aucun faux succès**, saisie conservée |
| 6.3 | Invalider la session (Auth → révoquer les sessions) puis enregistrer | message « Ta session a expiré… », saisie conservée |
| 6.4 | Deux personnes modifient la même fiche | ⚠️ la seconde écrase la première **sans avertissement** — comportement connu, décision en attente (B3) |

> **6.4 n'est pas un test qui échoue** : c'est le comportement actuel,
> caractérisé et documenté. Le noter tel quel.

---

## 7. Consigner le résultat

Pour chaque ligne : `OK`, `KO`, ou `NON TESTÉ`. Pour chaque `KO`, noter le rôle,
l'étape, ce qui était attendu et ce qui s'est produit — une capture aide.

Créer ensuite `docs/recette-connectee-<date>.md` sur ce modèle, comme
`docs/recette-staging-2026-08-05.md`.

**Un `KO` sur 1.13, 4.6 ou 5.x est bloquant** : ce sont les trois défauts
corrigés pendant ce chantier, et le seul moyen de confirmer qu'ils le sont
réellement en conditions réelles.
