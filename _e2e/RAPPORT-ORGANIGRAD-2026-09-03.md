# Rapport E2E — ORGANIGRAD — 2026-09-03, révisé le 2026-09-04

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

## 2. Chiffres

Décompte au 2026-09-04, après reprise. Un élément peut porter un verdict révisé : c'est le
dernier qui compte.

| Indicateur | Valeur |
|---|---|
| Éléments parcourus | **82** |
| `OK` | 34 |
| `CASSÉ` | 2 |
| `DÉGRADÉ` | 12 |
| `NON CÂBLÉ` | 0 |
| `CONFIRMÉ` / `TRANCHÉ` (constats de fond) | 7 |
| `BLOQUÉ` — dépendance non satisfaite | 8 |
| `NON TESTÉ` — action interdite, outil, ou périmètre | 13 |
| `NON TESTABLE` en l'état | 3 |
| `SANS OBJET` | 1 |
| Corrections de code appliquées | **0** — mode CONSTAT |
| Migration appliquée en production | **1** (`20260901090000`, hors code, sur demande) |
| Pauses d'authentification | 1 déclarée le 04/09 ; celle du 03/09 n'a pas eu lieu à formuler |

Répartition par sévérité : **P1 = 7** · P2 ≈ 8 · P3 ≈ 6 · **P0 = 0**.

Les 8 `BLOQUÉ` et 3 `NON TESTABLE` restants sont détaillés en §10 — ce ne sont pas des écrans
en bon état, ce sont des écrans **non jugés**.

## 3. P0 et P1 restants

Aucun P0. Sept P1, dont deux découverts seulement après le déblocage de l'import.

| # | Élément | Constat | Cause (fichier:ligne) | Correctif proposé |
|---|---|---|---|---|
| 1 | **Hiérarchie perdue à l'import** | Le fichier rattachait 8 fiches sur 10 ; en base, `rattachement_id = null` partout. La perte est **invisible** : l'organigramme dessine des niveaux par `gradeStyle` | `src/utils/importMapping.ts:124` (`rattachementId: null` en dur) ; aucune colonne de rattachement lue (l.104-114) ; l'identifiant envoyé est un slug du nom (l.42-51), pas l'`id` du fichier | Lire une colonne de rattachement **et** la convertir par la même fonction de slug, sinon les deux ne se rencontrent jamais. À défaut, le dire dans l'aperçu |
| 2 | **Trois colonnes du format livré ignorées** | `rattachementId`, `typeTemps`, `gradeStyle` de `public/data.csv`. Constaté : `type_temps='Complet'` pour les 10 fiches, là où le fichier disait « Temps plein »/« Temps partiel » | `importMapping.ts:104-127` — alias trop étroits | Ajouter les alias du format livré, ou annoncer les colonnes dérivées dans l'aperçu |
| 3 | **Toute erreur Supabase s'affiche `[object Object]`** | Rencontré sur l'import : la réponse portait `message`, `code`, `details` **et** un `hint` donnant la signature attendue. Rien n'est montré | `src/utils/asyncGuard.ts:21-25` — `String(err)` sur un objet simple ; appelé depuis `useOrgChartController.ts:334` | Lire `err.message` quand l'objet en porte un. Deux lignes, et l'application redevient capable de dire ce qui ne va pas |
| 4 | **Écriture directe en base sans orchestrateur** | Orchestrateur **jamais** configuré : la création de nœud écrit en production sans avertissement, et le prompt système y est stocké **en clair** (vérifié par sonde) | `useOrchestratorBridge.ts` + `hybridNodeRepo.ts`, chemin de repli — cf. `[KB]` audit P1 n°3, dont le périmètre était plus étroit | Avertir à l'écran que l'écriture contourne l'orchestrateur, ou refuser les champs sensibles dans ce mode |
| 5 | **Bouton « Reset » exposé sans contrôle de rôle** | Rouge, permanent, en haut à droite de l'organigramme : vide toutes les fiches du workspace, irréversible. Le refus n'arrive qu'au clic | `src/App.tsx:400-410` (affichage) ; refus tardif `useOrgChartController.ts:255-258` | Masquer hors rôle administrateur, comme le fait le reste de l'interface |
| 6 | **`audit_log` écrit et lu nulle part** | La table contient des lignes ; aucune vue ne les expose. Un administrateur ne peut pas savoir qui a fait quoi | Absence d'écran, pas de défaut de code | Une vue de consultation, même minimale |
| 7 | **Écart dépôt ↔ production** | ~~Import cassé, `PGRST202`~~ — **résolu le 2026-09-03** par application de la migration | `agentRepo.ts:238-245` ↔ base à 5 paramètres | **Fait.** Reste à téléverser le bundle : la production sert encore la version du 27/08 |

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

**Aucune correction de code n'a été appliquée** : la campagne était en `CONSTAT`. Les correctifs
proposés dans le fichier d'état n'ont été ni écrits, ni compilés, ni testés — ce sont des
pistes, pas des livrables.

La migration fait exception parce qu'elle ne corrigeait pas un défaut de code mais un **écart
d'état** entre le dépôt et la base, et parce qu'elle a été demandée puis vérifiée pièce par
pièce. Le bundle de production, lui, **n'a pas été téléversé** : le serveur sert toujours celui
du 27/08.

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

**Non atteint — dépendance non satisfaite (8)** : consultation d'un organigramme peuplé,
ouverture d'une fiche, navigation par pôle, lien profond `?agent=` à froid (le P1 n°5 de
l'audit), recherche Spotlight sur une fiche réelle, bascule Vue Hybride, export par lots sur
données réelles, effacement de `skills`/`avatarUrl` sur PUT partiel.

Ces huit-là **étaient** débloqués par la migration : ils ont été replanifiés le 04/09, et la
reprise s'est arrêtée sur une **session expirée** avant de les parcourir. Ils restent donc
non jugés — pas en bon état, non jugés.

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

1. **Réparer l'import avant tout le reste.** Lire la colonne de rattachement et la convertir
   par la même fonction de slug que les identifiants ; ajouter les alias `typeTemps` et
   `gradeStyle`. Sans cela, l'application produit des organigrammes sans hiérarchie et le
   dit à personne — et le cas 1.4 de la recette reste invérifiable.
2. **Corriger `describeError`** (`asyncGuard.ts:21-25`) pour lire `err.message`. Deux lignes,
   et l'application redevient capable d'expliquer ses pannes. C'est ce défaut qui a masqué
   l'écart de migration pendant des semaines.
3. **Téléverser le bundle en production**, puis rejouer les 8 éléments non atteints. Le script
   est prêt ; la production sert encore la version du 27/08, à cinq paramètres.

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
