# Rapport E2E — ORGANIGRAD — 2026-09-03

Campagne en **CONSTAT**, orchestrateur **LOCAL**, écriture autorisée.
Compte `ceglialaurent@gmail.com`, rôle **`owner`**, sur la base de **production**
`xucmfdggetwxmpquqjvj`. 79 éléments planifiés, 79 parcourus.
Fichier d'état : [`PROGRESS-ORGANIGRAD.md`](PROGRESS-ORGANIGRAD.md) · contexte :
[`CONTEXTE-ORGANIGRAD.md`](CONTEXTE-ORGANIGRAD.md).

---

## 0. Addendum du 2026-09-04 — reprise après migration

Ce rapport a été écrit le 2026-09-03, **avant** que la migration `20260901090000` soit
appliquée. Elle l'a été le 2026-09-03 par le connecteur MCP Supabase, et la campagne a été
reprise le **2026-09-04** sur les 14 éléments qui en dépendaient. Le corps du rapport
ci-dessous n'a pas été réécrit : lire cet addendum d'abord.

**Le verdict change.** L'import fonctionne : 10 fiches créées, persistantes après
rechargement, modifiables, supprimables. Le parcours principal va désormais de bout en bout.

**Trois constats neufs, dont deux P1** — voir `PROGRESS-ORGANIGRAD.md` :

| # | Constat | Sévérité |
|---|---|---|
| L-80 | **La hiérarchie déclarée dans le fichier n'est pas importée** (`importMapping.ts:124`, `rattachementId: null` en dur). Les 10 fiches sont 10 racines. La perte est **invisible** : l'écran affiche des niveaux par `gradeStyle`, donc un organigramme plausible sur une base sans aucun lien | **P1** |
| L-81 | **L'importateur ne reconnaît pas trois colonnes de son propre format d'exemple** (`rattachementId`, `typeTemps`, `gradeStyle`). Constaté : `type_temps='Complet'` pour les 10 fiches, là où le fichier disait « Temps plein » / « Temps partiel » | **P1** |
| L-38 | **Le P1 n°4 de l'audit du 29/08 ne se reproduit pas** : la première édition après import aboutit, la fiche porte un UUID serveur. À requalifier dans l'audit | — |

**Ce qui passe maintenant** : L-20 import (CASSÉ → **OK**), L-21 persistance, L-35 à L-37
modification et persistance (**cas 1.3 de la recette : passe**), L-43 export CSV (1 460 o,
bien formé), L-45 aperçu A3, L-46 bouton « Télécharger » visible à 1054 px, L-47 PDF produit
(11,2 Mo — rendu rastérisé, conformité visuelle non vérifiée), L-51/L-53/L-54 suppression et
nettoyage.

**Ce qui reste hors d'atteinte** : le cas 1.4 de la recette (reprise des rattachements par le
supérieur) est **non testable tant que L-80 n'est pas corrigé**, faute de supérieur.

**Données de test** : les 10 fiches créées pendant la reprise ont été supprimées par l'agent
et leur absence vérifiée en base. Les 5 fiches de « Recette staging 2026-08-05 » n'ont pas été
touchées.

⚠️ **Le bundle de production n'a pas été téléversé.** Depuis la migration, le serveur sert
toujours celui du 27/08, à cinq paramètres : un ré-import des deux sources de « Recette
staging » y serait refusé (`40001`). Un import vers une source neuve passe.

---

## 1. Verdict

**Non, un utilisateur lambda ne peut pas aller au bout du parcours principal.** Il casse à la
première étape qui compte : **l'import de fiches échoue**, et le message affiché est
`[object Object]`. Sans import, l'organigramme reste vide — donc rien à consulter, modifier,
exporter ni supprimer.

La cause n'est pas dans le code applicatif mais dans l'**écart entre le dépôt et la base** :
le code appelle `import_org_agents` avec six paramètres, la production n'en connaît que cinq.
La coquille, elle, est saine : navigation, rôles, états vides, confirmations, cloisonnement
des clés — tout ce qui entoure le trou fonctionne.

Second constat, indépendant et plus profond : **la SPA écrit directement en base de production
quand l'orchestrateur n'est pas configuré**, sans le dire, et y stocke le prompt système en clair.

---

## 2. Chiffres

| Indicateur | Valeur |
|---|---|
| Éléments planifiés | 79 |
| Éléments parcourus | 79 |
| `OK` | 23 |
| `CASSÉ` | 1 |
| `DÉGRADÉ` | 8 |
| `NON CÂBLÉ` | 0 |
| `BLOQUÉ` (dépendance non satisfaite) | 14 |
| `NON TESTÉ` — action interdite | 5 |
| `NON TESTÉ` — hors d'atteinte de l'outil ou du périmètre | 12 |
| `CONFIRMÉ` / `TRANCHÉ` (constats de fond) | 8 |
| `[À CONFIRMER]` | 8 |
| Corrections appliquées | **0** — mode CONSTAT |
| Pauses d'authentification | 0 formulée (session déjà ouverte, cf. §10) |

Répartition par sévérité : **P1 = 4** · **P2 = 6** · **P3 = 5** · P0 = 0.

---

## 3. P0 et P1 restants

| # | Élément | Route | Constat | Cause (fichier:ligne) | Correctif proposé |
|---|---|---|---|---|---|
| 1 | Import de fiches | barre supérieure → aperçu | **CASSÉ** — aucune fiche créée ; `PGRST202`, fonction introuvable | `src/services/agentRepo.ts:238-245` envoie `p_expected_updated_at` ; migration `20260901090000` non appliquée en production | Appliquer la migration **après** avoir reconstruit et téléversé la SPA, dans l'ordre du §3 de `etat-production-2026-09-02.md` |
| 2 | Message d'erreur d'import | idem | **DÉGRADÉ** — affiche `[object Object]` | `src/utils/asyncGuard.ts:21-25` : `String(err)` sur un objet supabase-js, appelé depuis `useOrgChartController.ts:334` | Dans `describeError`, lire `err.message` (et `hint`) quand l'objet en porte ; deux lignes |
| 3 | Écriture sans orchestrateur | `?v=orchestration` | **CONFIRMÉ** — écriture directe en base de production, sans avertissement ; **prompt système stocké en clair** | `src/hooks/useOrchestratorBridge.ts` + `src/services/hybridNodeRepo.ts` (chemin de repli), cf. `[KB]` audit P1 n°3 | Avertir à l'écran que l'écriture contourne l'orchestrateur, ou refuser les champs sensibles dans ce mode |
| 4 | Bouton « Reset » de l'organigramme | `?v=orgchart` | **NON TESTÉ — interdit** — vide tout le workspace, irréversible, affiché sans contrôle de rôle | `src/App.tsx:400-410` (affichage) ; refus tardif dans `useOrgChartController.ts:255-258` | Masquer le bouton hors rôle administrateur, comme le fait déjà le reste de l'interface |

---

## 4. Ruptures de parcours

Les points où un utilisateur se serait arrêté sans savoir quoi faire.

1. **L'import échoue et n'explique rien.** `[object Object]` sous les modes d'import. La
   réponse du serveur contenait pourtant `message`, `code`, `details` **et** un `hint` qui
   donnait la signature attendue. Tout est jeté à l'affichage. *Conséquence concrète :
   l'application est incapable de dire à un administrateur que sa base a besoin d'une migration.*
2. **L'organigramme vide donne une consigne impossible.** « Sélectionnez un pôle dans la barre
   latérale » alors que la barre latérale dit « Aucun pôle disponible pour le moment. » Deux
   composants décrivent le même état vide sans se parler ; aucun des deux ne dit d'importer.
3. **Trois boutons d'export, trois comportements.** EXPORT CSV et EXPORT PDF répondent par une
   phrase **déjà affichée en permanence** — le clic ne change rien de perceptible. « Export par
   lots A3 » est **totalement muet** (`App.tsx:179`, `return` nu). L'utilisateur ne sait pas si
   son clic a été pris en compte.
4. **Les deux graphiques du tableau de bord sont des cartes vides**, sans un mot d'explication,
   alors que la barre latérale sait dire son état vide.
5. **Sur téléphone (375 px), la barre supérieure se superpose à elle-même** — trois textes
   empilés au même endroit. C'est le premier écran que voit un utilisateur mobile.

---

## 5. Générations

| Génération | Déclencheur | Résultat obtenu | Délai constaté | Verdict |
|---|---|---|---|---|
| Export CSV | « EXPORT CSV » | aucun changement perceptible (organigramme vide) | immédiat | `NON TESTÉ` sur données réelles |
| Export PDF (aperçu) | « EXPORT PDF » | aperçu non ouvert : `canExport` faux | — | `NON TESTÉ` |
| Export PDF (fichier) | « Télécharger » | jamais atteint | — | `NON TESTÉ` |
| Export par lots A3 | lien de la barre latérale | **rien, silencieusement** | immédiat | `DÉGRADÉ P2` |
| Import CSV | injection dans le champ de fichier | aperçu correct (10 lignes, 10 valides), **puis échec** | < 1 s | **`CASSÉ P1`** |

Aucun fichier n'a pu être produit ni ouvert. **La règle « une image de 0 octet ou un PDF blanc
est un CASSÉ » n'a donc pas pu être appliquée** : il n'y a rien eu à vérifier. Le point 1.15 de
la recette (position du bouton « Télécharger » hors 1280×720) **reste entier** — résolution
utilisée ici : 1055×890.

---

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

Le détail est dans [`ECARTS-KB-ORGANIGRAD.md`](ECARTS-KB-ORGANIGRAD.md) (phase C). Les quatre
qui comptent :

- **La fenêtre de migration est ouverte, dans l'autre sens que celui documenté.**
  `etat-production-2026-09-02.md` §3 craint « SPA ancienne + fonction nouvelle » ; la réalité
  est « code à jour + fonction ancienne ». Le document avait raison sur le principe
  (« il n'existe pas d'ordre sans fenêtre »), pas sur le sens.
- **L'audit du 29/08 est périmé sur au moins deux points** : le changement de rôle **est**
  confirmé (`MembersView.tsx:202`), et l'export CSV **a** un `try/catch` dont le commentaire
  documente la correction du P2. Deux réserves à retirer.
- **L'audit décrit un défaut mobile qui n'est pas celui qu'on observe** : les marges de
  Members/ApiKeys se comportent bien ; c'est la barre supérieure qui casse.
- **Le défaut « écriture directe » est plus large que documenté** : il ne demande pas un
  orchestrateur *configuré puis éteint*, un orchestrateur *jamais configuré* suffit.

---

## 8. Corrections appliquées

| Fichier:ligne | Anomalie | Correctif | Retesté à l'écran | Commit |
|---|---|---|---|---|
| — | — | — | — | — |

**Aucune correction n'a été appliquée** : la campagne était en mode `CONSTAT`. Les correctifs
proposés dans le fichier d'état n'ont été ni écrits, ni compilés, ni testés — ce sont des
pistes, pas des livrables.

---

## 9. À nettoyer

| Objet | Emplacement | Créé le |
|---|---|---|
| _(rien)_ | — | — |

**La base de production est dans l'état où la campagne l'a trouvée.** Le seul objet créé — le
nœud `[TEST] Noeud 2026-09-03-01` — a été supprimé par l'agent, et son absence vérifiée par
lecture directe de `hybrid_nodes`. Les 10 fiches `[TEST]` n'ont jamais existé : l'import les a
refusées. Les 20 nœuds préexistants du 2026-08-11 et l'unique clé API en service n'ont **pas**
été touchés.

Une trace subsiste hors base : le fichier de fixture `_e2e/fixtures/agents-test-2026-09-03.csv`,
ignoré par Git, à supprimer si tu veux.

---

## 10. Ce qui n'a pas été testé, et pourquoi

**Écarté volontairement (action interdite)** — 5 éléments : invitation d'un membre (envoie un
e-mail à un tiers) · changement de rôle · création, régénération ou révocation d'une clé API
(l'unique clé fait tourner l'import des bots LINK) · « Zone de Danger » · bouton « Reset ».

**Non atteint (dépendance non satisfaite)** — 14 éléments : tout le CRUD de fiches, la
hiérarchie, les exports sur données réelles, la recherche sur une fiche. Tous suspendus à
l'import cassé. **Ce ne sont pas des écrans en bon état : ce sont des écrans non jugés.**

**Non testable en l'état** — 12 éléments, avec ce qu'il faudrait pour les rendre testables :

| Élément | Ce qu'il faudrait |
|---|---|
| Bouton « IMPORTER » de la barre supérieure | un humain : le sélecteur de fichier est natif, hors d'atteinte du pilote |
| Fichier PDF réellement produit et ouvrable | des données **et** un téléchargement hors navigateur piloté |
| Point 1.13 de la recette (second e-mail HITL) | l'orchestrateur **et** `RESEND_API_KEY` |
| Cas §2 à §5 de la recette (admin, member, viewer, extérieur) | quatre comptes sur un projet de **test** |
| Transitions d'orchestration réelles, flux SSE | l'orchestrateur lancé et une clé posée à la main |
| Anti double-clic (création, Run) | un outil capable de deux clics dans la fenêtre utile |
| Indicateur de cache périmé | provoquer la péremption en coupant la lecture Supabase |
| Micro vocal | le localiser dans la vue ; `[KB]` le dit non branché |

**Trois erreurs réseau restent inexpliquées** (`401`, `400` au chargement, plus un `404` qui est
le favicon absent). Toutes les tables interrogées répondent correctement. `[À CONFIRMER]`.

---

## 11. Suite recommandée

1. **Rouvrir la fenêtre de migration, dans le bon ordre.** Reconstruire la SPA depuis `master`,
   téléverser `dist/`, **puis** appliquer `20260901090000`, puis tester un import réel — c'est
   la séquence du §3 de `etat-production-2026-09-02.md`, et c'est ce qui débloque la moitié de
   cette campagne. Le point de montage de `organigrad-front` reste à relever.
2. **Corriger `describeError`** (`asyncGuard.ts:21-25`) pour lire `err.message`. Deux lignes,
   et l'application redevient capable d'expliquer ses pannes — à commencer par la précédente.
3. **Rejouer cette campagne une fois l'import réparé.** Quatorze éléments n'ont pas été jugés ;
   le fichier d'état les nomme un par un, il suffit de relancer le prompt 02.

---

## Note de méthode

Deux écarts au harnais, assumés et documentés dans le fichier d'état :

- le fichier d'état a été écrit **après chaque écran** (5 à 9 éléments) et non après chaque
  élément, pour tenir le volume d'écritures ; la résilience à une coupure reste assurée à
  l'écran près ;
- l'import et la confirmation de suppression ont été pilotés **par instrumentation**
  (injection du fichier dans le champ masqué, `confirm()` natif intercepté), faute d'outil
  capable des dialogues natifs. Ce qui a été prouvé dans les deux cas — l'échec de l'import,
  le libellé exact de la confirmation — est signalé comme tel, et le chemin par l'interface
  reste à vérifier à la main.

Enfin : **cette campagne n'a rien trouvé qui contredise le socle décrit par l'audit du 29/08.**
Elle a trouvé un trou fonctionnel que seul un test à l'écran pouvait révéler — la lecture de
code ne pouvait pas savoir que la base de production portait une autre signature.
