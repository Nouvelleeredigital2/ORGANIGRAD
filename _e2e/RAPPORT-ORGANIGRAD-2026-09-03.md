# Rapport E2E — ORGANIGRAD — 2026-09-03, révisé les 2026-09-04 et 2026-09-06

Campagne en **CONSTAT**, orchestrateur **LOCAL**, écriture autorisée.
Compte `ceglialaurent@gmail.com`, rôle **`owner`**, sur la base de **production**
`xucmfdggetwxmpquqjvj`.
**82 éléments parcourus** — 79 planifiés le 03/09, 3 ajoutés en cours de campagne.
Fichier d'état : [`PROGRESS-ORGANIGRAD.md`](PROGRESS-ORGANIGRAD.md) · contexte :
[`CONTEXTE-ORGANIGRAD.md`](CONTEXTE-ORGANIGRAD.md) · existant :
[`DOC-ORGANIGRAD.md`](DOC-ORGANIGRAD.md) · écarts :
[`ECARTS-KB-ORGANIGRAD.md`](ECARTS-KB-ORGANIGRAD.md).

> **Deux temps.** Le 2026-09-03, la campagne a buté sur un import cassé et 14 éléments sont
> restés non jugés. La migration `20260901090000` a été appliquée le soir même, et la campagne
> a été **reprise le 2026-09-04**. Ce rapport est réécrit à cette date : il décrit l'état
> **après** migration. L'historique d'avant n'a pas été effacé — il est dans le fichier d'état.

---

## 1. Verdict

**Oui, le parcours principal va de bout en bout** — depuis le 2026-09-03 au soir seulement.
Se connecter, importer un fichier, consulter, modifier, exporter, supprimer : chaque étape
aboutit et persiste. Ce n'était pas le cas au premier passage, où l'import échouait sur un
écart entre le dépôt et la base de production.

**Mais l'organigramme qu'on obtient n'est pas celui du fichier.** L'import lit neuf colonnes
sur onze du format livré avec l'application : la hiérarchie et le temps de travail sont
remplacés par des valeurs par défaut, sans un mot. L'écran, lui, dessine des niveaux à partir
du grade — l'utilisateur voit donc un organigramme plausible sur une base qui ne contient
**aucun lien d'autorité**. Sur un produit dont c'est l'objet même, c'est le défaut le plus
sérieux de cette campagne.

Deux constats indépendants pèsent autant. **L'application est incapable d'expliquer ses
pannes** : toute erreur venant de Supabase s'affiche `[object Object]`, message compris, code
compris, indice compris — tout est jeté. C'est ce qui a masqué pendant des semaines l'écart de
migration. Et **la SPA écrit directement en base de production quand l'orchestrateur n'est pas
configuré**, sans le dire, en y stockant le prompt système en clair.

Le reste du socle est sain : navigation, cloisonnement des rôles et des clés, confirmations
avant l'irréversible, états vides pour la plupart explicites.

> **Suite donnée, du 2026-09-05 au 2026-09-06.** Sur demande, la campagne est passée en
> **CORRECTION** pour les trois P1 les plus coûteux. Les trois sont corrigés, vérifiés à
> l'écran et en base, et **en ligne en production** : l'import lit la hiérarchie et les colonnes
> du format livré, et l'application sait enfin dire ce qui ne va pas. Un quatrième défaut est
> apparu en chemin (L-82, §3) — révélé par le correctif, pas causé par lui.

## 2. Chiffres

Décompte au 2026-09-04, après reprise. Un élément peut porter un verdict révisé : c'est le
dernier qui compte.

| Indicateur | Valeur |
|---|---|
| Éléments parcourus | **82** |
| `OK` | **38** |
| `CASSÉ` | 3 |
| `DÉGRADÉ` | 11 |
| `NON CÂBLÉ` | 0 |
| `CONFIRMÉ` / `TRANCHÉ` (constats de fond) | 7 |
| `NON TESTÉ` — action interdite, outil ou périmètre | 13 |
| `NON TESTABLE` en l état (2 pilotes, données, orchestrateur) | 3 |
| `BLOQUÉ` restant | 1 |
| `NON PARCOURU` — **oubli de l agent**, testable et non fait | 1 |
| `NON CONCLUANT` · `HORS PÉRIMÈTRE` · `SANS OBJET` | 3 |
| Corrections de code appliquées | **0** — mode CONSTAT |
| Migration appliquée en production | **1** (`20260901090000`, hors code, sur demande) |
| Pauses d'authentification | 1 déclarée le 04/09 ; celle du 03/09 n'a pas eu lieu à formuler |

Répartition par sévérité : **P1 = 7** · P2 ≈ 9 · P3 ≈ 6 · **P0 = 0**.

Le `BLOQUÉ` restant, les 3 `NON TESTABLE` et le `NON PARCOURU` sont détaillés en §10 — ce ne sont pas des écrans
en bon état, ce sont des écrans **non jugés**.

## 3. P0 et P1 restants

Aucun P0. Sept P1, dont deux découverts seulement après le déblocage de l'import.

| # | Élément | Constat | Cause (fichier:ligne) | Correctif proposé |
|---|---|---|---|---|
| 1 | ✅ **CORRIGÉ 05/09** — **Hiérarchie perdue à l'import** | Le fichier rattachait 8 fiches sur 10 ; en base, `rattachement_id = null` partout. La perte est **invisible** : l'organigramme dessine des niveaux par `gradeStyle` | `src/utils/importMapping.ts:124` (`rattachementId: null` en dur) ; aucune colonne de rattachement lue (l.104-114) ; l'identifiant envoyé est un slug du nom (l.42-51), pas l'`id` du fichier | Lire une colonne de rattachement **et** la convertir par la même fonction de slug, sinon les deux ne se rencontrent jamais. À défaut, le dire dans l'aperçu |
| 2 | ✅ **CORRIGÉ 05/09** — **Trois colonnes du format livré ignorées** | `rattachementId`, `typeTemps`, `gradeStyle` de `public/data.csv`. Constaté : `type_temps='Complet'` pour les 10 fiches, là où le fichier disait « Temps plein »/« Temps partiel » | `importMapping.ts:104-127` — alias trop étroits | Ajouter les alias du format livré, ou annoncer les colonnes dérivées dans l'aperçu |
| 3 | ✅ **CORRIGÉ 05/09** — **Toute erreur Supabase s'affiche `[object Object]`** | Rencontré sur l'import : la réponse portait `message`, `code`, `details` **et** un `hint` donnant la signature attendue. Rien n'est montré | `src/utils/asyncGuard.ts:21-25` — `String(err)` sur un objet simple ; appelé depuis `useOrgChartController.ts:334` | Lire `err.message` quand l'objet en porte un. Deux lignes, et l'application redevient capable de dire ce qui ne va pas |
| 4 | **Écriture directe en base sans orchestrateur** | Orchestrateur **jamais** configuré : la création de nœud écrit en production sans avertissement, et le prompt système y est stocké **en clair** (vérifié par sonde) | `useOrchestratorBridge.ts` + `hybridNodeRepo.ts`, chemin de repli — cf. `[KB]` audit P1 n°3, dont le périmètre était plus étroit | Avertir à l'écran que l'écriture contourne l'orchestrateur, ou refuser les champs sensibles dans ce mode |
| 5 | **Bouton « Reset » exposé sans contrôle de rôle** | Rouge, permanent, en haut à droite de l'organigramme : vide toutes les fiches du workspace, irréversible. Le refus n'arrive qu'au clic | `src/App.tsx:400-410` (affichage) ; refus tardif `useOrgChartController.ts:255-258` | Masquer hors rôle administrateur, comme le fait le reste de l'interface |
| 6 | **`audit_log` écrit et lu nulle part** | La table contient des lignes ; aucune vue ne les expose. Un administrateur ne peut pas savoir qui a fait quoi | Absence d'écran, pas de défaut de code | Une vue de consultation, même minimale |
| 7 | ✅ **RÉSOLU** — **Écart dépôt ↔ production** | ~~Import cassé, `PGRST202`~~ | `agentRepo.ts:238-245` ↔ base à 5 paramètres | Migration appliquée le 03/09, **bundle téléversé le 06/09** : code et base sont d'accord |
| 8 | 🔴 **NOUVEAU** — **La suppression en masse échoue dès qu'une hiérarchie existe** | « Reset » affiche « Suppression non effectuée », **aucune fiche supprimée**. Erreur réelle : `27000 — tuple to be updated was already modified…` | trigger `org_agents_reparent_children`, **`BEFORE DELETE FOR EACH ROW`** ; `clearWorkspace` supprime parent et enfants en une instruction | Passer le trigger en `AFTER DELETE`, ou supprimer des feuilles vers la racine. Contournement : la suppression une à une fonctionne |

## 4. Ruptures de parcours

Les points où un utilisateur se serait arrêté, ou aurait cru réussir.

1. **L'import réussit et ment.** « Import terminé : 10 ajoutée(s) » — mais la hiérarchie du
   fichier a disparu et les temps de travail ont été remplacés par « Complet ». L'aperçu
   annonçait « 10 lignes · 10 valides · 0 invalides » : exact pour le lecteur du fichier,
   trompeur pour celui qui l'a écrit. *C'est la rupture la plus coûteuse, parce qu'elle ne se
   voit pas.*
2. **Quand quelque chose échoue, l'application ne sait pas le dire.** `[object Object]`, en
   rouge, sans rien d'autre. Un administrateur n'a aucun moyen de comprendre — ni de rapporter
   — ce qui s'est passé.
3. **L'organigramme vide donne une consigne impossible.** « Sélectionnez un pôle dans la barre
   latérale » quand la barre latérale dit « Aucun pôle disponible ». Aucun des deux ne dit
   d'importer, qui est pourtant la seule action utile.
4. **Trois boutons d'export, trois comportements.** À vide, EXPORT CSV et EXPORT PDF répondent
   par une phrase **déjà affichée en permanence** — le clic ne change rien de perceptible ;
   « Export par lots A3 » est **totalement muet** (`App.tsx:179`, `return` nu).
5. **Les deux graphiques du tableau de bord sont des cartes vides**, sans un mot, alors que la
   barre latérale sait annoncer son état vide.
6. **Sur téléphone (375 px), la barre supérieure se superpose à elle-même** — trois textes
   empilés au même endroit, sur le premier écran que voit un utilisateur mobile.

## 5. Générations

Mesuré le 2026-09-04 sur 10 fiches réelles.

| Génération | Déclencheur | Résultat obtenu | Délai | Verdict |
|---|---|---|---|---|
| Import CSV | champ de fichier | **10 fiches créées**, persistantes après rechargement — mais 3 colonnes jetées (§3) | < 1 s | `OK` avec réserve **P1** |
| Export CSV | « EXPORT CSV » | **1 460 octets**, `text/csv;charset=utf-8;`, en-tête complet, 10 lignes conformes | immédiat | `OK` |
| Export PDF — aperçu | « EXPORT PDF » | aperçu A3 paysage, annuaire latéral, mention « Document généré automatiquement » | < 1 s | `OK` |
| Export PDF — fichier | « Télécharger le PDF » | **11 209 133 octets**, `application/pdf` | ~8 s | `OK` avec réserve |
| Export par lots A3 | lien de la barre latérale | non rejoué sur données réelles ; à vide, **rien, silencieusement** (`App.tsx:179`) | immédiat | `DÉGRADÉ P2` |

**Aucun export déclenché n'a produit de fichier vide.** La règle « un PDF blanc ou une image de
0 octet est un CASSÉ » ne s'applique à aucun d'eux.

Deux réserves, dites franchement :

- les téléchargements étant bloqués dans le navigateur piloté, les fichiers ont été lus **par
  interception** de `URL.createObjectURL`. Le contenu du **CSV a été vérifié** ; celui du
  **PDF ne l'a pas été** — taille et type seulement. « Le PDF s'ouvre-t-il, et n'est-il pas
  blanc ? » reste à faire à la main ;
- **11,2 Mo pour un pôle de cinq fiches** trahit un rendu rastérisé. Sur un organigramme réel,
  le poids deviendrait un problème en soi. À vérifier avant toute mise à l'échelle.

Le point **1.15 de la recette** est levé pour une résolution : à **1054 px** de large, le bouton
« Télécharger le PDF » est visible, mesuré à `x=914` — soit 140 px de marge. En dessous
d'environ 1000 px, il sortirait du cadre ; les largeurs inférieures restent non testées.

Le point **1.16** (un fichier par pôle) n'a **pas** été vérifié sur données réelles.

## 6. Espace admin

**Verdict : PRÊT AVEC RÉSERVES** — l'audit du 29/08 disait la même chose ; la campagne le
confirme à l'écran, avec une réserve de plus.

Ce qui fonctionne, vérifié : liste des membres avec rôle et badge `owner` · états vides
explicites et accentués · liste de rôles d'invitation qui **ne propose jamais `owner`** ·
validation du format d'e-mail côté navigateur (`abc` refusé avant tout envoi) · clés API
n'exposant que leur préfixe, avec la bonne explication · confirmation nommant l'objet avant
toute suppression.

Blocages et réserves :

1. **Le bouton « Reset »** de l'organigramme (§3, ligne 4) — réserve **nouvelle**, absente de
   l'audit, et plus exposée que la « Zone de Danger » qu'il signalait.
2. **`audit_log` est écrit et lu nulle part** — confirmé : la table contient des lignes, aucune
   vue ne les expose. Un administrateur ne peut pas savoir qui a fait quoi.
3. **Aucune gestion de workspace** dans l'interface — confirmé.
4. **Aucune recherche, tri, pagination ni action en masse** sur les listes admin.
5. **Invitations sans envoi d'e-mail** — non vérifié ici (action interdite), mais `[KB]`
   `etat-production-2026-09-02.md` §4.1 rappelle que `notify-email` répond `ok: true` **sans
   rien envoyer** tant que `RESEND_API_KEY` n'est pas posée.

---

## 7. Écarts avec la base de connaissance

Le détail est dans [`ECARTS-KB-ORGANIGRAD.md`](ECARTS-KB-ORGANIGRAD.md). Les quatre qui comptent :

- **La fenêtre de migration était ouverte, dans l'autre sens que celui documenté.**
  `etat-production-2026-09-02.md` §3 craignait « SPA ancienne + fonction nouvelle » ; la réalité
  était « code à jour + fonction ancienne ». Le document avait raison sur le principe
  (« il n'existe pas d'ordre sans fenêtre »), pas sur le sens. **Résolu depuis.**
- **Trois réserves de l'audit du 29/08 sont périmées** : le changement de rôle **est** confirmé
  (`MembersView.tsx:202`), l'export CSV **a** son `try/catch`, et le P1 n°4 (ids désynchronisés
  après import) **ne se reproduit pas**. À retirer ou requalifier.
- **L'audit décrit un défaut mobile qui n'est pas celui qu'on observe** : les marges de
  Members/ApiKeys se comportent bien ; c'est la barre supérieure qui casse.
- **Deux P1 manquent à l'audit** — hiérarchie non importée, colonnes du format d'exemple
  ignorées. Ni l'un ni l'autre n'était visible sans importer un vrai fichier et relire la base.

## 8. Corrections appliquées

| Objet | Nature | Vérifié | Trace |
|---|---|---|---|
| `20260901090000_import_org_agents_optimistic_lock` | **Migration de base de données**, appliquée en production le 2026-09-03 par le connecteur MCP, à la demande explicite de Laurent | **Oui** — signature à 6 paramètres, verrou consultatif présent, `execute` réservé à `authenticated`/`service_role`, une seule signature en base | commit `ef60139`, fichier `_e2e/migration-a-coller-20260903.sql` |

### Corrections de code, appliquées les 2026-09-05 et 06 sur demande explicite

| Correctif | Fichier | Vérification | Commit |
|---|---|---|---|
| Lecture de la hiérarchie du fichier importé (`mapImportedRowsToAgents`, seconde passe) | `src/utils/importMapping.ts`, `src/services/importService.ts` | **À l'écran et en base** : `rattachement_id` renseigné, `buildHierarchy` construit **un seul arbre** là où la campagne produisait dix racines | `f68a786` |
| Lecture de `typeTemps` et `gradeStyle` du format livré | `src/utils/importMapping.ts` | **En base** : « Temps partiel » conservé, grade du fichier respecté | `f68a786` |
| `describeError` lit les erreurs supabase-js | `src/utils/asyncGuard.ts` | **À l'écran, sur un appel réel** : « mode invalide : append (attendu merge\|replace) (22023) » au lieu de `[object Object]` | `7793303` |

`typecheck` 0 erreur · `lint` propre · **289 tests verts** (48 fichiers), dont **17 de
régression ajoutés** · `build` OK.

### Opérations d'infrastructure

| Objet | Nature | Vérifié |
|---|---|---|
| `20260901090000_import_org_agents_optimistic_lock` | Migration appliquée en production le 03/09 (connecteur MCP) | Signature à 6 paramètres, verrou consultatif, `execute` restreint |
| Bundle `index-CEzZZbxB.js` | Téléversé en production le 06/09, après archivage de `dist-avant-20260905` | **Depuis l'extérieur** : `https://organigrad.nouvelleeredigital.fr` sert le nouveau bundle, HTTP 200, et les trois marqueurs de correctif y sont présents |

> ⚠️ **Un déploiement s'est d'abord trompé de machine.** Le 05/09, le bundle est parti sur
> `srv1017182` en se fiant au relevé du 02/09 — or la SPA avait migré sur `srv1915630`. Le
> répertoire visé n'était plus servi par personne. L'erreur a été vue en interrogeant le **site
> public**, pas la machine. Documentée dans `docs/etat-production-2026-09-06.md` §1, avec les
> reliquats à nettoyer.

## 9. À nettoyer

| Objet | Emplacement | État |
|---|---|---|
| _(rien)_ | — | — |

**La base de production est dans l'état où la campagne l'a trouvée**, aux deux exceptions
assumées près : la migration appliquée (§8), et le fichier `/tmp/orga-sonde-transfert.html`
(1,4 ko) laissé sur le VPS lors d'un test de transfert — inoffensif, non supprimable depuis
cette session.

Tout ce qui a été créé a été supprimé et l'absence **vérifiée en base** : le nœud hybride
`[TEST]` du 03/09, les 10 fiches `[TEST]` du 04/09. Les 20 nœuds préexistants du 11/08, l'unique
clé API en service et les 5 fiches de « Recette staging 2026-08-05 » n'ont **pas** été touchés.

Une trace hors base : `_e2e/fixtures/agents-test-2026-09-03.csv`, ignoré par Git.

## 10. Ce qui n'a pas été testé, et pourquoi

**Écarté volontairement — action interdite (5)** : invitation d'un membre (elle expédie un
e-mail à un tiers) · changement de rôle d'un membre · création, régénération ou révocation
d'une clé API — l'unique clé fait tourner l'import des bots LINK · « Zone de Danger » des
Réglages · centre de validation et réinitialisation de chaîne, qui porteraient sur les 20 nœuds
préexistants.

> Le bouton « Reset » de l'organigramme, d'abord écarté pour la même raison, a finalement pu
> être **testé légitimement** le 04/09, une fois que toutes les fiches du workspace étaient des
> données créées par la campagne.

**Parcourus lors de la 2ᵉ passe du 04/09 (8)** : consultation d un organigramme peuplé, ouverture
d une fiche, navigation par pôle, recherche Spotlight sur une fiche réelle, bascule Vue Hybride,
export par lots sur données réelles, lien profond `?agent=` à froid, effacement `skills`/`avatarUrl`.
Deux d entre eux ont livré des constats : le lien profond ouvre **le mauvais pôle** (§3, P2), et
l export par lots produit bien **un fichier par pôle** — vérifié par empreinte SHA-256, après une
fausse alerte de doublon fondée sur la seule taille.

**Non parcouru — oubli de l agent (1)** : accessibilité clavier des nœuds de l organigramme. Les
données étaient là, l élément était testable, il ne l a pas été. Ce n est pas une limite d outil.

**Bloqué (1)** : modification concurrente sur deux onglets — un seul pilote de navigateur.

**Non testable en l'état (3 + les dépendances d'outil)** :

| Élément | Ce qu'il faudrait |
|---|---|
| Reprise des rattachements par le supérieur (recette 1.4) | que **le P1 n°1 soit corrigé** : sans hiérarchie importée, il n'existe aucun supérieur |
| Contenu visuel du PDF produit | un téléchargement hors navigateur piloté — le fichier existe, il n'a pas été ouvert |
| Bouton « IMPORTER » de la barre supérieure | un humain : le sélecteur de fichier est natif, hors d'atteinte du pilote |
| Écriture concurrente sur deux onglets (recette 6.4) | deux sessions simultanées ; `[KB]` le décrit comme un comportement connu, pas comme un test |
| Indicateur de cache périmé | provoquer la péremption en coupant la lecture Supabase en cours de session |
| Point 1.13 de la recette (second e-mail HITL) | l'orchestrateur **et** `RESEND_API_KEY` |
| Cas §2 à §5 de la recette (admin, member, viewer, extérieur) | quatre comptes sur un projet de **test**, qui n'existe pas |
| Transitions d'orchestration réelles, flux SSE | l'orchestrateur lancé et une clé posée à la main |
| Anti double-clic (création, Run) | un outil capable de deux clics dans la fenêtre utile |
| Micro vocal | le localiser dans la vue ; `[KB]` le dit non branché |

**Trois erreurs réseau restent inexpliquées** — `401` et `400` au chargement, plus un `404` qui
est le favicon absent. Toutes les tables interrogées répondent pourtant correctement.
`[À CONFIRMER]`.

## 11. Suite recommandée

Les trois premières recommandations de la version du 04/09 sont **faites**. Restent :

1. **Corriger L-82** — la suppression en masse échoue sur tout organigramme ayant une
   hiérarchie, c'est-à-dire sur tout organigramme correct depuis le correctif de l'import.
   Trigger en `AFTER DELETE`, ou suppression des feuilles vers la racine. Schéma et migrations :
   c'est un arbitrage, pas une évidence.
2. **Trancher le sort de l'orchestrateur** — il ne tourne sur aucune des deux machines
   (`docs/etat-production-2026-09-06.md` §4). Tant qu'il est absent, la SPA écrit directement en
   base et y stocke le prompt système en clair : c'est le P1 n°4, et il n'a pas de correctif
   côté code tant que la décision n'est pas prise.
3. **Rejouer les deux éléments non jugés** — accessibilité clavier de l'organigramme (non
   parcouru par oubli) et modification concurrente (deux navigateurs requis).

## Note de méthode

Quatre écarts au harnais, assumés et documentés dans le fichier d'état :

- le fichier d'état est écrit **après chaque écran** (5 à 9 éléments) et non après chaque
  élément, pour tenir le volume d'écritures ; la résilience à une coupure reste assurée à
  l'écran près ;
- `_e2e/captures/` est **vide** : l'outil navigateur rend les images dans la conversation sans
  les écrire sur le disque. Les preuves sont donc **citées** — texte exact affiché, mesure DOM,
  statut réseau, relecture en base. Un dossier de captures vide n'est pas un dossier de preuves,
  et c'est dit ici plutôt que laissé à deviner ;
- l'import, la confirmation de suppression et la lecture des fichiers exportés ont été pilotés
  **par instrumentation** — injection dans le champ masqué, `confirm()` natif intercepté,
  `URL.createObjectURL` intercepté. Ce qui a été prouvé l'est ; le chemin par l'interface reste
  à vérifier à la main pour ces trois points ;
- une **migration a été appliquée en production** (§8) alors que le mode était `CONSTAT`. Elle
  a été demandée explicitement, son rayon d'action mesuré avant (5 fiches de recette, dans un
  workspace qui n'est pas celui de l'utilisateur), et son résultat vérifié après.

Enfin, ce que cette campagne aura montré de plus utile n'est pas dans la liste des défauts :
**les deux P1 les plus sérieux ne sont apparus qu'après le déblocage d'un parcours amont.**
Tant que l'import échouait, tout ce qui en dépendait n'était pas « en bon état » — c'était
non jugé. L'audit du 29/08 annonçait « ~95 éléments interactifs, aucun cassé » ; il avait
raison **du point de vue du code**, et ne pouvait pas savoir que la base de production portait
une autre signature, ni qu'un fichier importé perdrait sa hiérarchie en chemin.
