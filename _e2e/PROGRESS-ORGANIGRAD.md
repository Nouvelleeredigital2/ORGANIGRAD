# E2E ORGANIGRAD — campagne du 2026-09-03

Mode        : CONSTAT · Orchestrateur : LOCAL · Écriture : AUTORISÉE (base de production)
Branche     : e2e/organigrad-2026-09-03
URL         : http://localhost:5173
Progression : 79/79 puis **REPRISE le 2026-09-04 après migration** — **24 éléments réinstruits** en deux passes, 2 constats neufs (L-80, L-81), 1 défaut de l'audit non reproduit (L-38). Données de test supprimées et vérifiées
Dernière MAJ: 2026-09-04 — 2e passe terminée

---

## PHASE 0 — CARTOGRAPHIE (faite)

### État constaté à l'ouverture `[E2E]`

| Constat | Valeur | Conséquence |
|---|---|---|
| Session | **déjà ouverte** à l'arrivée en phase 0 | la pause d'authentification est sans objet, cf. « PAUSES » |
| Compte / rôle | `ceglialaurent wor…` — **`owner`** | lève la zone d'ombre n°1 du contexte : le rôle le plus étendu, donc le plus dangereux |
| Volume de données | **0 agent · 0 pôle · moyenne NBI 0** | lève la zone d'ombre n°2 : le workspace est **vide** |
| Source de données | « **Jeu local embarqué** — aucune URL distante configurée, l'application utilise le CSV local intégré » | `[CODE]` `src/utils/csvSource.ts:12-19` : c'est le cas par défaut quand aucune URL n'est saisie ; l'organigramme lit `/data.csv`, pas Supabase |
| Orchestrateur | non configuré, non lancé (mode LOCAL arbitré) | les transitions seront simulées |
| Console / réseau | propres au chargement, toutes requêtes 200 | — |

**Ce que le workspace vide change.** Sans fiche, la moitié du plan (modification, suppression,
exports non vides, hiérarchie, recherche) n'a rien à mordre. **P3 — import — devient donc le
parcours amont dont tout le reste dépend** : c'est lui qui crée la matière. S'il casse, les
parcours P4 à P7 tombent en `BLOQUÉ` par dépendance, pas par défaut propre.

**Ce que le rôle `owner` change.** Aucun écran ne sera masqué : la campagne verra tout, y
compris les commandes destructrices. Le revers est qu'aucun refus par rôle ne pourra être
constaté — les cas §2 à §5 de la recette des 4 rôles (admin, member, viewer, extérieur)
resteront `NON TESTÉ`, faute de comptes. C'est une limite de couverture, pas un résultat.

### Désaccords entre les trois sources

- **D1 — port de démarrage** `[CODE]` `.claude/launch.json` force `5199 --strictPort` ;
  `vite.config.ts` ne surcharge rien ; `[KB]` `CLAUDE.md` §5 dit 5173 ; `[E2E]` **5173**
  constaté. → **P2**, piège de démarrage, inscrit en L-01.
- **D2 — `VITE_ORCHESTRATOR_URL`** `[KB]` `README.md` §3 lui donne un rôle (« sans elle →
  mode brouillon ») ; `[CODE]` `grep` sur `src/` et `orchestrator/src/` : **aucune occurrence**.
  Seul le `localStorage` configure l'orchestrateur (`useOrchestratorConfig.ts:13`). → **P2**,
  documentation qui décrit un mécanisme inexistant, inscrit en L-02.
- **D3 — deux sources de vérité pour l'organigramme** `[KB]` `README.md` §9 : « Supabase =
  source de vérité persistante, CSV/XLSX = import/export seulement » ; `[E2E]` l'écran annonce
  « Jeu local embarqué », donc un CSV **comme source d'affichage**. `[À CONFIRMER]` : lecture
  Supabase vide, repli sur `/data.csv`, ou CSV prioritaire ? → à trancher en P2/P3, inscrit
  en L-03.
- **D4 — les six vues du routeur sont toutes atteignables** `[CODE]` `appUrl.ts:16-23` ↔
  `[E2E]` barre latérale : Organigrammes, Tableau de bord, Orchestration, Membres, Clés API,
  Paramètres. **Aucune route documentée manquante, aucune route codée inatteignable.**
  Le désaccord attendu en phase 0 n'existe pas : c'est un bon point, à écrire comme tel.

---

## P1 — Entrée publique et coquille applicative (`/`)
- [x] L-01 Écran de connexion — **OK** — e-mail, mot de passe, « Se connecter », « Connexion par lien magique », « Créer un compte » ; console propre, requêtes 200 (constaté à 02h31 avant ouverture de session)
- [x] L-02 Barre latérale — **OK** — les 6 destinations de `appUrl.ts:16-23` sont présentes et la vue active est surlignée
- [x] L-03 Sélecteur de workspace — **DÉGRADÉ P3** — nom, rôle `owner`, liste « Workspaces » (une entrée) et « Se déconnecter » : corrects. Mais le menu **ne se ferme pas avec `Échap`** (deux pressions sans effet, il reste ouvert même pendant l'ouverture du Spotlight) ; seul un second clic sur le sélecteur le referme — `src/components/layout/Sidebar.tsx` — correctif proposé : écouteur `keydown` sur `Escape` comme dans `useSpotlight`, non appliqué (mode CONSTAT)
- [x] L-04 Barre supérieure — **OK** — champ « Rechercher un agent, un service… » avec le raccourci `⌘K` affiché
- [x] L-05 Spotlight `⌘K` — **OK** — `Ctrl+K` ouvre le panneau (« Chercher par nom, prénom, fonction ou service », navigation aux flèches annoncée), la saisie fonctionne, `Échap` ferme
- [x] L-06 Panneau SOURCE — **DÉGRADÉ P3** — libellé et texte d'aide affichés et exacts, mais **sans accents** : « Jeu local embarque », « Aucune URL distante configuree. L'application utilise le CSV local integre. » — cause : `src/utils/csvSource.ts:17-18`, les chaînes sont écrites sans accents dans le code — correctif proposé : accentuer les littéraux, non appliqué (mode CONSTAT). Confirme `[KB]` audit du 29/08 P3 « accents manquants », mais **pas seulement sur des écrans legacy** : c'est la barre latérale principale
- [x] L-07 Panneau PÔLES — **OK** — état vide explicite et correctement accentué : « Aucun pôle disponible pour le moment. »
- [x] L-08 « Export par lots A3 » sur organigramme vide — **DÉGRADÉ P2** — le lien est cliquable et **ne produit rien** : aucun fichier, aucun message, aucun changement d'écran. Deux clics, deux fois rien. Cause : `src/App.tsx:179`, `if (poleDirectory.length === 0) return;` — sortie silencieuse avant tout retour utilisateur, alors que les trois bilans d'export (`App.tsx:216-226`) sont écrits juste en dessous et ne sont jamais atteints dans ce cas. C'est le défaut que la recette nomme « proposer puis échouer » — correctif proposé : afficher « Aucun pôle à exporter » au lieu du `return` nu, ou désactiver le lien quand `poleDirectory` est vide ; non appliqué (mode CONSTAT)
- [x] L-09 Déconnexion — **OK avec réserve P3** — présente, mais uniquement dans le menu du sélecteur de workspace : confirme `[KB]` audit du 29/08 parcours 1 « déconnexion cachée dans le dropdown workspace ». Non actionnée : la déconnexion interromprait la campagne

## P2 — Session authentifiée : tableau de bord (`?v=dashboard`)
- [x] L-10 Compteur « Effectif Total » — **OK** — 0 agents, cohérent avec `public/data.csv` qui ne contient que sa ligne d'en-tête (82 octets) et avec `organigrad_org_agents_v1::…` = `[]`
- [x] L-11 Compteur « Moyenne NBI » — **OK** — 0 pts sur effectif nul (pas de division par zéro affichée, pas de `NaN`)
- [x] L-12 Compteur « Pôles Actifs » — **OK** — 0 directions, cohérent avec le panneau PÔLES vide
- [x] L-13 Graphique « Répartition des Temps » — **DÉGRADÉ P3** — carte affichée, titre présent, **contenu entièrement vide sans un mot d'explication**. La barre latérale, elle, sait dire « Aucun pôle disponible pour le moment. » — l'incohérence est dans le tableau de bord, pas dans les données — correctif proposé : état vide explicite, non appliqué
- [x] L-14 Graphique « Top Pôles (Effectifs) » — **DÉGRADÉ P3** — même constat que L-13
- [x] L-15 Message « Importez des fiches avant d'exporter. » — **OK** — affiché en permanence près des boutons d'export tant que l'effectif est nul ; c'est le seul endroit de l'écran principal qui explique l'état vide
- [x] L-16 Bas du tableau de bord — **OK** — la page défile de peu et ne cache aucun élément interactif supplémentaire ; l'écran tient en une vue à 1055×890

## P3 — Création de la matière : import (`?v=settings` → fichier)
- [x] L-17 Fixture — **OK** — `_e2e/fixtures/agents-test-2026-09-03.csv` : 10 lignes, 2 pôles, hiérarchie par `rattachementId`, tous les noms et pôles préfixés `[TEST]`, en-têtes conformes à `public/data.csv`
- [x] L-18 Bouton « IMPORTER » — **NON TESTÉ — HORS D'ATTEINTE DE L'OUTIL** — il déclenche un sélecteur de fichier **natif du système**, que le pilote de navigateur ne peut ni voir ni refermer ; le déclencher risquait de bloquer la campagne sur une boîte de dialogue modale. Le champ sous-jacent est conforme `[E2E]` : un seul `input[type=file]`, `accept=".csv,.xlsx,.xls"`, masqué. **À vérifier à la main en deux secondes.** L'import lui-même a été testé en injectant le fichier dans ce champ (L-19)
- [x] L-19 Modale d'aperçu — **OK** — s'ouvre sur injection du fichier : nom du fichier, « Destination : Workspace ceglialaurent workspace », compteurs **10 lignes · 10 valides · 0 invalides · 0 doublons**, deux modes explicités (« Compléter — ajoute et met à jour, sans rien retirer » / « Remplacer — retire aussi les fiches de ce même fichier absentes de cette version »), boutons « Annuler » et « Importer 10 fiches ». Écran clair, qui dit où il écrit
- [x] L-20 Validation de l'import — **CASSÉ P1 — aucun contournement** — « Importer 10 fiches » échoue, **aucune fiche n'est créée**. Cause établie par appel direct de la RPC (charge vide, aucune écriture) :

  - avec les **6 paramètres que le code envoie** → `PGRST202` : « Could not find the function `public.import_org_agents(p_agents, p_expected_updated_at, p_mode, p_source_kind, p_source_ref, p_workspace_id)` in the schema cache », avec l'indice « Perhaps you meant `import_org_agents(p_agents, p_mode, p_source_kind, p_source_ref, p_workspace_id)` » ;
  - avec les **5 paramètres présents en base** → la fonction répond (`22023 — mode invalide`), donc **elle existe bien en version 5 paramètres**.

  Cause : `src/services/agentRepo.ts:238-245` envoie `p_expected_updated_at`, ajouté par la migration `20260901090000_import_org_agents_optimistic_lock.sql` — **qui n'est pas appliquée en production**. `[KB]` `docs/etat-production-2026-09-02.md` §3 documente précisément cette fenêtre, mais **dans l'autre sens** (SPA ancienne + fonction nouvelle → « import périmé »). La réalité constatée est le sens inverse : **code à jour + fonction ancienne → fonction introuvable**. Le document annonce « il n'existe pas d'ordre sans fenêtre » : la fenêtre est ouverte, et c'est le dépôt local qui est du mauvais côté.

  Correctif proposé (non appliqué, mode CONSTAT) : appliquer `20260901090000` **après** avoir reconstruit et téléversé la SPA, dans l'ordre exact du §3 du document du 02/09. Hors périmètre de cette campagne — schéma et migrations, cf. `01-CONFIG.md`

  ### ✅ REPRISE 2026-09-04 — **CORRIGÉ, RETESTÉ, OK**
  La migration `20260901090000` a été appliquée en production le 2026-09-03 par le connecteur
  MCP Supabase (`93ec54b8` → `xucmfdggetwxmpquqjvj`), puis vérifiée : signature à 6 paramètres,
  `pg_advisory_xact_lock` présent, `execute` réservé à `authenticated`/`service_role`, une seule
  signature en base. **L'import rejoué le 2026-09-04 aboutit** : « Import terminé : 10 ajoutée(s),
  0 mise(s) à jour », et `org_agents` contient bien 10 lignes dans le workspace `ceglialaurent
  workspace` (5 par pôle), créées à 09:00:35 UTC. **Verdict L-20 : OK.**
- [x] L-21 Persistance après rechargement — **OK (2026-09-04)** — les 10 fiches sont en base, lues depuis Supabase et non depuis un cache : le panneau SOURCE est passé de « Jeu local embarqué » à « **Organigramme enregistré** », et la barre latérale liste les deux pôles `[TEST]`
- [x] L-22 Destination des écritures — **TRANCHÉ, puis CONFIRMÉ à l'écran le 2026-09-04** : après import réussi, l'indicateur de source bascule sur « Organigramme enregistré » et les lignes sont lisibles directement dans `org_agents`. Le désaccord D3 est clos — **TRANCHÉ** — l'import vise bien **Supabase** (RPC `import_org_agents` sur `xucmfdggetwxmpquqjvj`), pas le cache local : `agentRepo.ts:179-206` ne prend le chemin `localStorage` que si le contexte est local, ce qui n'est pas le cas avec un workspace actif. Le désaccord D3 se résout ainsi : **Supabase est bien la source de vérité en écriture** ; « Jeu local embarqué » ne désigne que la **source de lecture initiale** (`/data.csv`, 82 octets, en-tête seul). Les deux affirmations de la base de connaissance sont exactes, elles parlent de deux choses différentes
- [x] L-23 Message d'erreur d'import — **DÉGRADÉ P1** — le seul retour affiché est **`[object Object]`**, en rouge, sous les modes d'import. Ni ce qui a échoué, ni quoi faire. Cause : `src/utils/asyncGuard.ts:21-25`, `describeError` retourne `String(err)` pour tout ce qui n'est ni `Error` ni `string` — or **les erreurs de supabase-js sont des objets simples** (`{message, code, details, hint}`), jamais des instances d'`Error`. Tout échec PostgREST de ce chemin s'affiche donc `[object Object]`, quel qu'il soit. Appelé depuis `useOrgChartController.ts:334`.

  Le message existait pourtant : la réponse portait `message`, `code`, `details` **et** `hint` — l'indice donnait même la signature attendue. Toute cette information est jetée à l'affichage — correctif proposé : lire `err.message` quand l'objet en porte un ; non appliqué
- [x] L-24 Filament d'import — **NON TESTÉ** — l'import n'ayant jamais abouti, le filament de succès n'a pas pu être observé dans les conditions que `[KB]` l'audit décrit. À reprendre quand L-20 sera corrigé
- [x] L-25 Champ d'URL CSV distante — **OK** — présent dans Réglages (« Source distante », « URL du fichier CSV distant (optionnelle) », bouton « Utiliser la source distante »), avec la source active affichée juste au-dessus. Non rempli

## P4 — Consultation, recherche, navigation (`?v=orgchart`)
- [x] L-26 Organigramme peuplé — **OK (2026-09-04)** — le pôle sélectionné s'affiche avec son titre, son effectif (« 5 agents »), sa mention « Pôle complet · Vue RH », et les cartes par niveau. ⚠️ Les niveaux viennent de `gradeStyle`, **pas** d'une hiérarchie de données (L-80). Ancien constat sur état vide, conservé ci-dessous car il tient toujours quand le workspace est vide : **DÉGRADÉ P2 (état vide)** — l'écran affiche « Sélectionnez un pôle dans la barre latérale pour afficher son organigramme. » alors que la barre latérale annonce, elle, « Aucun pôle disponible pour le moment. » **L'écran principal donne une consigne impossible à suivre.** Deux composants décrivent le même état vide, chacun à sa façon, sans se parler — correctif proposé : un seul message d'état vide, qui dit d'importer ; non appliqué
- [x] L-27 Ouvrir une fiche — **OK (2026-09-04)** — le bouton « Profil » de la carte ouvre la modale sur le bon agent (Roux, direction du pôle Beta) ; `Échap` la referme
- [x] L-28 Navigation par pôle — **OK (2026-09-04)** — clic sur « [TEST] Pole Beta 2026-09-03 » dans la barre latérale : le titre, l'effectif et les cinq cartes changent, et l'URL passe à `?pole=%5BTEST%5D+Pole+Beta+2026-09-03`. La sélection est bien portée par l'URL
- [x] L-29 `?pole=` inconnu — **OK** — `?pole=inexistant` est ignoré sans erreur ni écran cassé, et la clé est **retirée de l'URL**. `[CODE]` `appUrl.ts:72` : seules les valeurs valides sont réécrites ; `?v=orgchart` disparaît aussi, la vue étant celle par défaut. Comportement propre
- [x] L-30 Lien profond `?agent=` à froid — **CASSÉ P2 (2026-09-04)** — et le défaut n'est **pas** celui que l'audit décrivait.

  Testé avec l'identifiant de `[TEST] Girard`, qui appartient au **pôle Beta**. L'application ouvre le **pôle Alpha**, réécrit l'URL en `?pole=%5BTEST%5D+Pole+Alpha…&agent=53789e93-…`, et n'affiche que les cinq agents d'Alpha. **La fiche visée est introuvable à l'écran.**

  Cause : `src/hooks/useOrgChartController.ts:365-376` — en l'absence de `poleKey` dans l'URL, l'effet sélectionne `poleDirectory[0]`, le **premier pôle**, sans jamais consulter `agentPoleKeyMap` (l.411-419) qui sait pourtant à quel pôle appartient chaque agent. La fonction `focusAgentPole` (l.449) fait exactement cela — mais elle n'est appelée que depuis les interactions internes, jamais depuis le chemin du lien profond.

  `[KB]` L'audit du 29/08 (P1 n°5) annonçait « l'URL affiche le bon pôle sans rien mettre en évidence ». Le correctif du surlignage a bien été appliqué — le commentaire du code le documente (l.425-438) — mais **le pôle, lui, est le mauvais**. Le défaut a donc changé de nature, pas disparu.

  Correctif proposé (non appliqué, mode CONSTAT) : dans l'effet de sélection par défaut, préférer `agentPoleKeyMap.get(route.agentId)` à `poleDirectory[0]` quand un agent est demandé. Ancien libellé : **NON TESTABLE EN L'ÉTAT** — un UUID inexistant est ignoré proprement (aucune erreur, clé retirée de l'URL), mais le défaut `[KB]` P1 n°5 (surlignage inopérant dans un onglet neuf) exige une fiche réelle : il reste **non vérifié**, faute d'import (L-20)
- [x] L-31 Spotlight sur une fiche réelle — **OK (2026-09-04)** — `Ctrl+K` puis « Girard » : la fiche remonte dans les résultats, aucun message « Aucun résultat ». La recherche porte bien sur les données enregistrées
- [x] L-32 Recherche sans résultat — **OK** — « Aucun résultat trouvé pour … » suivi de « Vérifiez l'orthographe ou essayez un autre terme. » : message clair, accentué, orienté action
- [x] L-33 Bascule Vue Hybride — **NON CONCLUANT (2026-09-04)** — le bouton « Bascule entre la carte RH legacy et la carte HybridNode » existe et répond, mais aucune commande `Run` / `Valider` / `Éditer` n'apparaît sur les cartes après bascule. Cohérent avec `[KB]` l'audit P3 (« non transmis par OrgChartNode, volontaire mais trompeur ») — **le constat de l'audit se vérifie**, sans que je puisse distinguer un choix délibéré d'un oubli `[À CONFIRMER]`
- [x] L-34 Accessibilité clavier des nœuds — **NON PARCOURU, par ma faute (2026-09-04)** — les données existaient pendant la 2ᵉ passe, l'élément était donc testable, et je ne l'ai pas fait : je l'ai laissé de côté en enchaînant sur l'export par lots, puis j'ai supprimé les fiches. **Ce n'est pas une limite d'outil, c'est un oubli**, et il est écrit ici comme tel. Ce qu'on sait par ailleurs : côté orchestration, `HybridNodeCard` expose bien des rôles bouton nommés (L-34 initial) ; côté organigramme, `[KB]` l'audit signale des `<div onClick>` non focalisables dans `OrgChart` et `ProfileModal` — **non vérifié à l'écran**

## P5 — Modification de la donnée de test
- [x] L-35 Mode Édition — **OK (2026-09-04)** — `?edit=1` active le mode (badge « ÉDITION » en bas de l'organigramme) ; la clé est ensuite retirée de l'URL. Les commandes d'édition apparaissent sur la carte (Profil, Contact, corbeille). ~~BLOQUÉ~~ — la bascule vit dans l'organigramme, qui n'affiche aucune fiche (L-20). `?edit=1` est accepté puis retiré de l'URL sans effet visible, faute de fiche à éditer
- [x] L-36 Modifier une fiche — **OK (2026-09-04)** — champ « Fonction » de `[TEST] Durand` passé à « Directrice de pole [MODIF E2E] », bouton « Enregistrer » : la valeur est en base à 09:20:34 UTC, sans erreur ni message technique
- [x] L-37 Persistance après rechargement — **OK (2026-09-04)** — après rechargement complet de la page, « [MODIF E2E] » est toujours affiché sur la carte et présent en base. **C'est le cas 1.3 de la recette des 4 rôles : il passe.**
- [x] L-38 Première édition après import — **NON REPRODUIT — le défaut `[KB]` P1 n°4 ne s'est pas manifesté (2026-09-04)** — l'audit du 29/08 annonçait qu'après une promotion CSV → base, la première édition échouerait sur `invalid input syntax for type uuid`, les ids clients survivant à l'import. Constaté ici : la première modification après import **aboutit**, la fiche porte bien un UUID serveur (`346c45a1-…`) et non un slug, et rien n'apparaît en console. À faire retirer des P1 de l'audit, ou à requalifier. Ancien libellé : **NON TESTABLE** — le défaut `[KB]` P1 n°4 (désynchronisation d'ids après promotion CSV → base, `invalid input syntax for type uuid`) suppose un import **réussi**. L'import échouant en amont (L-20), ce défaut est **hors d'atteinte** : il n'est ni confirmé ni infirmé, et le restera tant que la migration ne sera pas appliquée
- [x] L-39 Effacement de `skills` / `avatarUrl` — **HORS PÉRIMÈTRE, confirmé** — le défaut `[KB]` P2 (`dto.ts:79,84`) porte sur le **PUT de l'API orchestrateur**. En mode LOCAL, la SPA n'emprunte pas ce chemin : elle écrit en Supabase direct. Non reproductible ici par construction, et non par manque de données
- [x] L-40 Indicateur de cache périmé — **CONFIRMÉ par le code, non déclenché à l'écran** — `[CODE]` `useOrgChartController.ts:517-518` expose bien `agentsStale` et `agentsError` ; aucune des cinq vues ne les affiche. Provoquer la péremption exigeait de couper la lecture Supabase en cours de session : non fait, pour ne pas fausser le reste de la campagne. `[À CONFIRMER]` à l'écran
- [x] L-41 Modification concurrente — **NON TESTABLE avec un seul pilote** — exige deux sessions simultanées sur la même fiche ; le navigateur piloté n'en tient qu'une. `[KB]` La recette 6.4 décrit d'ailleurs ce comportement comme **connu et caractérisé** (la seconde écriture écrase sans avertir), pas comme un test qui échoue. Depuis, le verrou optimiste sur `updated_at` (`docs/architecture/concurrence-ecritures.md`, et la migration appliquée le 03/09 pour les imports) devrait le refuser par un `409` : **à vérifier à deux navigateurs**
- [x] L-42 Annulation d'une modification — **OK par équivalence** — non testable sur une fiche (L-20), mais vérifié sur l'éditeur de nœud : « Annuler » ferme sans enregistrer, et `Échap` ferme également la modale d'édition. Aucune création parasite constatée en base après annulation

## P6 — Générations (exports)
- [x] L-43 « EXPORT CSV » — **OK sur données réelles (2026-09-04)** — fichier produit, **1 460 octets**, type `text/csv;charset=utf-8;`, nommé `Organigramme-Export-04/09/2026.csv`. En-tête complet (`id, updated_at, nom, prenom, fonction, titre, service, pole, rattachementId, gradeStyle, typeTemps, nbi, externalKey, sourceKind, sourceRef`) et les 10 fiches `[TEST]` présentes avec leurs identifiants serveur. Non vide, bien formé, conforme aux données affichées. **Méthode** : les téléchargements étant bloqués dans le navigateur piloté, `URL.createObjectURL` et `HTMLAnchorElement.click` ont été interceptés pour lire le contenu réellement produit ; le fichier n'a pas été ouvert depuis le disque.

  ⚠️ **Le fichier exporté porte une colonne `rattachementId` vide** pour les 10 fiches — l'aller-retour import → export perd la hiérarchie, cf. L-80.

- [x] L-43bis (ancien libellé) — **NON TESTÉ sur données réelles** — impossible de juger un fichier produit sans fiche (L-20). Sur organigramme vide, le clic **ne produit aucun changement perceptible** (cf. L-50)
- [x] L-44 Gestion d'échec de l'export CSV — **CORRIGÉ DEPUIS L'AUDIT** — `[CODE]` `App.tsx:231-251` : le chemin est désormais entouré d'un `try/catch` qui affiche « Export CSV impossible : … », et le commentaire du code documente explicitement la correction de ce P2 (« partait sans try/catch … Audit P2 »). **Le défaut `[KB]` P2 n'existe plus.** Réserve : le message passe par `messageErreurUtilisateur`, donc il retomberait sur `[object Object]` pour une erreur supabase-js (L-23)
- [x] L-45 Aperçu « EXPORT PDF » — **OK (2026-09-04)** — l'aperçu s'ouvre, titré « [TEST] Pole Alpha 2026-09-03 · A3 paysage », avec la mise en page par niveaux (Direction, Responsable, Expert, Agent, Support), un annuaire latéral, la date et l'effectif, et la mention « Document généré automatiquement — ne pas modifier ». Boutons « Fermer » et « Télécharger le PDF » présents. Ancien libellé : **NON TESTÉ** — `[CODE]` `App.tsx:128-134` : l'aperçu ne s'ouvre que si `canExport`, faux sur un organigramme vide. L'aperçu A3 n'a donc pas pu être vu
- [x] L-46 Bouton « Télécharger le PDF » — **OK à 1054 px (2026-09-04)** — le bouton est **visible et atteignable**, mesuré à `x=914` pour une page de **1054 px** de large. ⚠️ La marge est de 140 px : en dessous d'environ 1000 px de large, il sortirait du cadre. `[KB]` recette 1.15 demandait de noter la résolution — **résolution éprouvée : 1054×890**. Les largeurs inférieures restent non testées. Ancien libellé : **NON TESTÉ** — dépend de l'aperçu (L-45). ⚠️ **Le point 1.15 de la recette reste entier** : la position du bouton hors 1280×720 n'a jamais été vérifiée, et cette campagne ne l'a pas fait non plus. Résolution utilisée ici, pour mémoire : **1055×890**
- [x] L-47 PDF produit — **OK, avec une réserve (2026-09-04)** — un fichier est réellement engendré : type `application/pdf`, **11 209 133 octets** (11,2 Mo). Non vide, donc ni « PDF blanc » ni fichier de 0 octet. **Réserve** : le téléchargement étant bloqué dans le navigateur piloté, le fichier n'a pas été ouvert — sa **conformité visuelle n'est pas vérifiée**, seule son existence et sa taille le sont. ⚠️ 11 Mo pour un pôle de 5 fiches est considérable : cela trahit un rendu **rastérisé** plutôt que vectoriel. Un organigramme complet produirait un fichier très lourd. Ancien libellé : **NON TESTÉ** — aucun fichier n'a pu être engendré (L-45). Les téléchargements sont par ailleurs bloqués dans le navigateur piloté : même avec des données, la vérification « le fichier s'ouvre et n'est pas blanc » **aurait dû être faite à la main**. À inscrire au reste à faire
- [x] L-48 Temporisation d'export — **CONFIRMÉ par le code** — `[CODE]` `App.tsx:142` : `await new Promise((resolve) => setTimeout(resolve, 800))` avant l'export réel, délai figé indépendant de la taille de l'organigramme. Sur un grand organigramme, rien ne garantit que le rendu soit terminé. Non observable en l'état (L-45)
- [x] L-49 « Export par lots A3 » — **OK sur données réelles (2026-09-04)** — **deux fichiers produits pour deux pôles**, comme le demande `[KB]` la recette 1.16 : `application/pdf`, 11 209 133 et 11 209 132 octets.

  ⚠️ **Piège évité** : deux tailles à un octet d'écart ressemblaient à un doublon — le même pôle exporté deux fois, faute d'attente suffisante du DOM (`App.tsx:192-194`, 1 200 ms figés). Contrôle par **empreinte SHA-256** des deux blobs : `db01c1fd8b2e7f16…` et `cd2178f1d9b2c12a…` — **différentes**. Ce sont bien deux documents distincts ; la proximité des tailles vient du rendu rastérisé, qui produit une page de gabarit identique où seuls quelques noms changent. **Constat initial infirmé par la mesure.** Ancien libellé : **NON TESTÉ sur données réelles** ; le comportement à vide est décrit en L-08 (`DÉGRADÉ P2`, sortie silencieuse). `[CODE]` `App.tsx:192-201` : la boucle attend **1 200 ms par pôle** et produit bien un fichier par pôle, avec un bilan partiel explicite (`App.tsx:216-226`) — mécanique correcte sur le papier, jamais vue tourner
- [x] L-50 Export sur organigramme vide — **DÉGRADÉ P2, et incohérent d'un bouton à l'autre** — trois commandes d'export, trois comportements différents :

  - **EXPORT CSV** et **EXPORT PDF** : `[CODE]` `App.tsx:129-133` et `232-235` appellent `feedback.info("Importez des fiches avant d'exporter.")` — mais **cette phrase est déjà affichée en permanence** dans la barre supérieure. À l'écran, le clic ne produit donc **aucun changement perceptible** : l'utilisateur ne sait pas si son clic a été pris en compte. `[À CONFIRMER]` : qu'une notification ait bien été émise sans être distinguable du texte permanent.
  - **Export par lots A3** : aucun message du tout (`App.tsx:179`, `return` nu) — cf. L-08.

  Trois boutons proposés sur un état où aucun ne peut aboutir, dont un totalement muet — correctif proposé : désactiver les trois tant que `canExport` est faux, avec une info-bulle unique ; non appliqué

## P7 — Suppression de la donnée de test
- [x] L-51 Suppression — **OK (2026-09-04)** — testée par la commande « Reset » de l'organigramme, qui vide les fiches enregistrées du workspace. Confirmation demandée avant l'irréversible, libellé exact et **chiffré** : « Supprimer les 10 fiches enregistrées ? Cette action est irréversible. » Après acceptation, `org_agents` ne contient **plus aucune ligne** dans ce workspace, vérifié en base
- [x] L-52 Reprise des rattachements — **NON TESTABLE, à cause de L-80** — l'import n'ayant créé aucun lien hiérarchique, il n'existe aucun supérieur susceptible d'adopter les orphelins. Le cas **1.4 de la recette des 4 rôles reste entier**, et le restera tant que L-80 n'est pas corrigé. `[CODE]` `agentRepo.ts:252-262` implémente l'adoption par le grand-parent côté local — non vérifié à l'écran
- [x] L-53 Persistance d'une suppression — **OK (2026-09-04)** — la suppression des 10 fiches est persistée : lecture directe de `org_agents` après coup, 0 ligne dans `ceglialaurent workspace`, et les 5 fiches de « Recette staging 2026-08-05 » **intactes**
- [x] L-54 Nettoyage des fiches `[TEST]` — **FAIT ET VÉRIFIÉ (2026-09-04)** — les 10 fiches créées pendant la reprise ont été supprimées par l'agent ; comptage final en base : `ceglialaurent workspace` = **0 fiche**, `Recette staging 2026-08-05` = 5 fiches, inchangées. Ancien libellé : **SANS OBJET** — aucune fiche n'a jamais été créée (L-20). Le seul objet créé de toute la campagne, le nœud `[TEST]`, a été supprimé et sa disparition vérifiée en base (L-66). **La base de production est dans l'état où la campagne l'a trouvée**

## P8 — Orchestration, en mode LOCAL (`?v=orchestration`)
- [x] L-55 État de connexion — **OK, et bien fait** — bandeau explicite : « Mode local · transitions simulées (configurer l'orchestrateur dans Paramètres) ». Il dit l'état **et** où le changer. C'est exactement ce que la fiche de contexte demandait de vérifier en premier
- [x] L-56 Créer un nœud — **OK** — éditeur clair : archétype (Humain / Agent IA / Logiciel MCP), nom, rôle, parent (liste des 20 nœuds existants), compétences, prompt système. Le formulaire **s'adapte à l'archétype** : « Humain » remplace compétences et prompt par e-mail HITL et webhook Slack. Création confirmée, journal alimenté « Nœud créé »
- [x] L-57 Anti double-clic à l'enregistrement — **[À CONFIRMER]** — non reproduit : le pilote ne peut pas garantir deux clics dans la fenêtre utile. Le défaut `[KB]` P2 (`NodeEditor.tsx:353-359`) reste **non infirmé** ; aucune création en double n'a été observée sur une création unique
- [x] L-58 Destination d'écriture sans orchestrateur — **CONFIRMÉ — P1** — le nœud a été écrit **directement dans Supabase de production**, pas dans le cache local : `hybrid_nodes` contenait bien `[TEST] Noeud 2026-09-03-01` (id `3d13ce92-…`, créé à 01:11:39 UTC), tandis que le `localStorage` restait à ses 20 nœuds préexistants, inchangé. Aucun avertissement à l'écran : le journal affiche « Nœud créé », comme si l'orchestrateur avait travaillé.

  **Et le prompt système est stocké en clair.** Sonde écrite dans le champ « Prompt système » (texte anodin, aucun secret) : `SONDE-E2E-2026-09-03 ceci n'est pas un secret…`. Relu depuis la base : **identique, en clair**. Il est de plus **affiché sur la carte** dans la liste, sans survol.

  Ceci **confirme et étend** `[KB]` l'audit du 29/08, P1 n°3 fonctionnel, qui décrivait le cas « orchestrateur **configuré mais éteint** ». Le constat ici est plus large — **orchestrateur jamais configuré**, même bascule silencieuse, même écriture directe. C'était la zone d'ombre n°3 de la fiche de contexte : elle est levée. `[À CONFIRMER]` : que le chemin orchestrateur, lui, chiffrerait ce champ — non vérifiable sans lancer l'orchestrateur, hors périmètre en mode LOCAL
- [x] L-59 Bouton « Run » — **OK (simulé)** — exécuté **sur mon propre nœud `[TEST]`**, jamais sur un nœud préexistant. Anti double-clic : **[À CONFIRMER]**, même raison qu'en L-57
- [x] L-60 Transition de statut — **OK, conforme au mode annoncé** — `IDLE → EXECUTING` à 03:13:27 puis `EXECUTING → IDLE` à 03:13:28. La transition est **simulée et non persistée** : la table `node_transitions` reste à **0 ligne** et le statut en base demeure `IDLE`. Ce n'est pas un défaut — c'est ce que le bandeau L-55 annonce. **Aucun verdict sur l'orchestration réelle ne peut en être tiré**
- [x] L-61 Journal d'activité — **OK** — quatre entrées horodatées, lisibles et cohérentes : « Nœud créé » (03:11:39), « Nœud mis à jour » (03:12:28), « IDLE → EXECUTING · En exécution » (03:13:27), « EXECUTING → IDLE · En repos » (03:13:28). Confirme `[KB]` l'audit : c'est un **flux volatile**, pas un audit — rien n'en est écrit dans `node_transitions`
- [x] L-62 Centre de validation — **NON TESTÉ** — aucun nœud n'était en attente de validation, et en amener un exigeait d'exécuter une chaîne sur des nœuds **préexistants** (interdit, §5). Le mien, seul et sans parent, ne produit pas de gate
- [x] L-63 Réinitialiser un nœud — **NON TESTÉ** — le bouton « Réinitialiser » de l'en-tête porte sur la chaîne entière, donc sur les 20 nœuds préexistants : action interdite (§5)
- [x] L-64 Micro vocal — **NON TESTÉ** — le bouton n'a pas été trouvé dans la vue Orchestration au niveau de zoom utilisé ; `[KB]` audit P2 le situe dans `VoiceMicButton.tsx:18-22`, transcription non branchée. Non infirmé, non confirmé
- [x] L-65 Modale de détails d'un nœud — **NON TESTÉ** — ouvrir la fiche d'un nœud **préexistant** est en lecture seule et aurait été licite, mais le nœud `[TEST]` a été supprimé avant ce point du parcours. À reprendre
- [x] L-66 Suppression du nœud `[TEST]` — **OK** — confirmation demandée avant l'irréversible, libellé exact : « Supprimer [TEST] Noeud 2026-09-03-01 ? » (`HybridNodeCard.tsx:363`). Après acceptation, `hybrid_nodes` ne contient **plus aucune ligne `TEST`** et les 20 nœuds préexistants sont intacts. **Méthode** : la confirmation étant un `confirm()` **natif**, hors d'atteinte du pilote, elle a été instrumentée pour enregistrer son libellé et répondre « oui ». Le dialogue lui-même n'a donc pas été vu à l'écran — son déclenchement et son texte, si
- [x] L-80 **Hiérarchie perdue à l'import — CASSÉ P1 (2026-09-04)** — l'import réussit, annonce « 10 ajoutée(s) », et **jette silencieusement toute la hiérarchie déclarée dans le fichier**. Vérifié en base : les 10 fiches ont `rattachement_id = null`, alors que le CSV portait une colonne `rattachementId` renseignée pour 8 d'entre elles (deux directions, deux responsables, six rattachés).

  Cause : `src/utils/importMapping.ts:124`, `rattachementId: null` — **codé en dur**. La fonction `mapRow` lit `Nom`, `Prénom`, `Fonction`, `Grade`, `Statut`, `NBI`, `Temps`, `Service`, `Pôle` (`importMapping.ts:108-114`) et **aucune colonne de rattachement** : le lien hiérarchique n'est jamais extrait du fichier.

  Deuxième maillon, indépendant : l'identifiant envoyé au serveur est un **slug dérivé du nom** (`import:test-durand-camille-directrice-de-pole`, `importMapping.ts:42-51`), pas l'`id` du CSV. Même si `rattachementId` était lu, il porterait la valeur brute du fichier (`2`, `7`) qui ne correspondrait à aucun `external_key`. La passe de rattachement de la RPC (`… join parent on parent.external_key = a->>'rattachement_external_key'`) ne trouverait donc rien.

  **Pourquoi c'est grave sur ce produit précisément** : Organigrad est un organigramme. Un import qui rapporte un succès complet en supprimant les liens hiérarchiques laisse une base **sans aucune relation d'autorité**.

  ⚠️ **Précision apportée après vérification** — un premier jet de ce constat disait « produit une liste plate ». **C'est faux à l'écran** : l'organigramme affiche bien des niveaux (Direction au-dessus de Responsable, puis Expert, Agent, Support), et l'aperçu PDF aussi. Mais cette hiérarchie est **une mise en page par `gradeStyle`**, pas une relation lue dans les données : `buildHierarchy.ts:46-67` n'attache un enfant que par `rattachementId`, et les 10 fiches sont donc **10 racines** — vérifié en base *et* dans le cache client. **La perte est donc invisible** : l'utilisateur voit un organigramme plausible là où la base ne contient aucun lien. C'est ce qui rend le défaut coûteux plutôt qu'évident.

  Conséquence en cascade : le cas **1.4 de la recette des 4 rôles** (« supprimer une fiche → les rattachements sont repris par le supérieur ») devient invérifiable, faute de supérieur. Voir L-52.

  Correctif proposé (non appliqué, mode CONSTAT) : lire une colonne de rattachement dans `mapRow`, et la convertir en **clé externe** avec la même fonction de slug que les identifiants — sinon les deux ne se rencontreront jamais. À défaut, avertir à l'écran que la hiérarchie n'est pas importée, plutôt que d'annoncer un succès sans réserve

- [x] L-81 **L'importateur ignore trois colonnes de son propre format d'exemple — DÉGRADÉ P1 (2026-09-04)** — le fichier livré avec l'application, `public/data.csv`, déclare `id, pole, service, nom, prenom, fonction, titre, rattachementId, gradeStyle, typeTemps, nbi`. Le lecteur `mapImportedRowToAgent` (`src/utils/importMapping.ts:104-127`) n'en reconnaît qu'une partie :

  | Colonne du format livré | Alias attendus par le code | Lue ? |
  |---|---|---|
  | `pole` | `Pôle / Direction`, `Pole / Direction`, `pole` | oui |
  | `service` | `Service / Secteur`, `Service`, `service` | oui |
  | `nom`, `prenom`, `fonction`, `titre`, `nbi` | variantes présentes | oui |
  | **`rattachementId`** | *aucun* — `rattachementId: null` codé en dur (l.124) | **non** |
  | **`typeTemps`** | `Temps`, `temps` uniquement (l.114) | **non** |
  | **`gradeStyle`** | recalculé depuis `fonction`/`titre`/`statut` (l.125) | **non** |

  Constaté en base après import : les 10 fiches portent `type_temps = 'Complet'` alors que le fichier déclarait « Temps plein » pour 7 et « Temps partiel » pour 3 — la valeur par défaut a remplacé la donnée. Même mécanique, silencieuse, pour la hiérarchie (L-80).

  **Aucun avertissement à l'écran** : l'aperçu d'import annonce « 10 lignes · 10 valides · 0 invalides », ce qui est vrai au sens du lecteur mais trompeur pour l'utilisateur — trois colonnes de son fichier ont été jetées. `exemple_organigramme.csv`, également livré, porte les mêmes en-têtes et subirait le même sort.

  Correctif proposé (non appliqué, mode CONSTAT) : ajouter les alias du format livré (`typeTemps`, `gradeStyle`, `rattachementId`) — ou, si ces colonnes sont volontairement dérivées, le dire dans l'aperçu d'import plutôt que d'annoncer 10 lignes valides sans réserve

- [x] L-79 Erreurs console sur les cartes de nœuds — **DÉGRADÉ P3** — 5 erreurs React répétées : « Encountered two children with the same key, `veille` ». Cause : `src/components/HybridNodeCard.tsx:307`, `skills.map((skill) => <Pill key={skill}>)` — la clé est la valeur de la compétence, or cinq nœuds préexistants portent `skills: ["veille","veille"]` en double (Marina, Pedro, Alain, Hannah, Eric, créés le 2026-08-11). React avertit d'un risque de duplication ou d'omission d'éléments. **Trouvé hors plan**, en relevant la console pendant L-08 ; le déclencheur exact du rendu n'est pas attribué `[À CONFIRMER]` — correctif proposé : `key={`${skill}-${i}`}` ou déduplication des compétences à la lecture ; non appliqué

## P9 — Espace admin et écrans périphériques
- [x] L-67 `?v=members` — **OK** — en-tête « Workspace · ceglialaurent workspace », texte d'intention (« Invite des collaborateurs, attribue-leur un rôle, ou retire l'accès. Les invitations expirent automatiquement après 14 jours. »), « MEMBRES ACTIFS · 1 » avec le compte et son badge `OWNER`, « INVITATIONS EN ATTENTE · 0 — Aucune invitation en attente. » États vides explicites et accentués
- [x] L-68 Formulaire d'invitation — **NON TESTÉ — ACTION INTERDITE** — présent et complet : champ e-mail, liste de rôles, bouton « Inviter ». **Non soumis** : l'invitation expédie un courriel à un tiers (§5). Détail notable `[E2E]` : la liste de rôles propose `admin`, `member`, `viewer` — **jamais `owner`**, ce qui ferme proprement la promotion accidentelle
- [x] L-69 Sélecteur de rôle d'un membre — **NON TESTÉ — ACTION INTERDITE**, mais **`[KB]` l'audit paraît périmé sur ce point** : il annonce un changement de rôle « appliqué au `onChange`, sans confirmation ». Or `[CODE]` `MembersView.tsx:202` porte bien une confirmation — `if (!confirm("Changer le rôle de ... en « ... » ?")) return;`. Le défaut a vraisemblablement été corrigé depuis le 29/08 ; à faire retirer de la liste des réserves. Non vérifié à l'écran, le seul membre étant l'owner lui-même, dont le rôle n'est pas modifiable (badge, pas de liste)
- [x] L-70 Validation du format d'e-mail — **OK côté client** — le champ est un `input type="email"` **requis** : la saisie `abc` est refusée par le navigateur avant tout envoi, avec le message « Veuillez inclure "@" dans l'adresse e-mail. Il manque un symbole "@" dans "abc". » `[KB]` l'audit vise la **RPC**, qui accepte `abc` : la faiblesse serveur reste entière, mais elle n'est pas atteignable par l'interface. Champ vidé après le test, rien n'a été soumis
- [x] L-71 `?v=api-keys` — **OK** — la vue charge et liste **une clé en service** : « Import LINK · Bots Hermes », créée le 11/08/2026, **utilisée le 11/08/2026**. Formulaire de création présent (« Nom de la clé », « Créer la clé ») et bouton de révocation — **aucun des deux actionné** (§5) : cette clé fait tourner l'import des bots LINK, la révoquer casserait une intégration réelle
- [x] L-72 Absence de clé en clair — **OK** — seul le **préfixe** `ok_b91db5bf…` est affiché, jamais le token complet. L'écran l'annonce d'ailleurs : « Le token complet n'est affiché qu'une seule fois à la création — copie-le immédiatement. » Conforme à `[KB]` README §12 (hachage SHA-256, valeur montrée une fois)
- [x] L-73 `?v=settings` — **OK** — cinq sections : **Source de données** (source active, fichier local, URL distante), **Orchestrateur · Connexion** (URL de l'API + clé API workspace + « Enregistrer la connexion » — c'est bien ici que se pose le mode connecté, cf. L-58), **Bots Hermes · LINK** (import des bots, correctement verrouillé : « Enregistre d'abord la connexion orchestrateur ci-dessus »), **Orchestration · Nœuds Hybrides** (vider le cache local, avec une explication honnête : « ce n'est pas une suppression »), **Zone de Danger**. Aucun champ renseigné par l'agent
- [x] L-74 « Zone de Danger » et bouton « Reset » — **partiellement TESTÉ le 2026-09-04** : le bouton « Reset » a pu être actionné **légitimement** une fois que toutes les fiches du workspace étaient des données `[TEST]` créées par la campagne. Il demande bien confirmation, en annonçant le nombre exact de fiches. La « Zone de Danger » des Réglages, elle, reste **NON TESTÉE — ACTION INTERDITE**. Constat d'affichage inchangé (aucun contrôle de rôle avant le clic). Ancien libellé : **NON TESTÉ — ACTION INTERDITE** — présente, avec le bouton « REINITIALISER LES DONNEES LOCALES ». Non cliqué.

  **Constat supplémentaire, hors audit** : un second bouton **« Reset »**, rouge, est affiché **en permanence en haut à droite de l'organigramme** (`App.tsx:400-410`). Il appelle `handleResetData`, qui **supprime toutes les fiches enregistrées du workspace** (`clearWorkspace`, irréversible). Son affichage n'est conditionné qu'à la vue active — **aucun contrôle de rôle** — le refus n'arrive qu'au clic (`useOrgChartController.ts:255-258`). C'est le même motif que la Zone de Danger relevé par `[KB]` l'audit, mais sur un écran que l'audit ne cite pas, et bien plus exposé : il est dans le champ de vision permanent. Non cliqué
- [x] L-75 Messages d'erreur techniques — **CONFIRMÉ, en pire** — le cas rencontré (L-23) ne produit ni anglais ni code PL/pgSQL, mais **`[object Object]`**, c'est-à-dire aucune information du tout. `[KB]` l'audit annonçait des messages bruts mais lisibles ; la réalité est un message vide de sens
- [x] L-76 Journal d'audit — **CONFIRMÉ** — `audit_log` **contient des lignes** (lecture directe : au moins une), et **aucune vue de l'interface ne l'expose**. Le « Journal d'activité » de l'orchestration n'est pas cet audit : c'est un flux volatile, non persisté (L-61). Un administrateur n'a donc aucun moyen, dans l'application, de savoir qui a fait quoi
- [x] L-77 Gestion des workspaces — **CONFIRMÉ** — aucune création, aucun renommage, aucune suppression de workspace nulle part dans les cinq vues. Le sélecteur liste, il n'administre pas
- [x] L-78 Affichage à 375 px — **DÉGRADÉ P2 — et le défaut n'est pas celui qu'annonçait l'audit** — les vues Membres et Clés API se comportent **bien** : le contenu se réempile, les formulaires restent utilisables, les marges ne sont pas le problème que `[KB]` l'audit décrivait (`px-12`).

  En revanche **la barre supérieure se superpose à elle-même** : le libellé « Rechercher un agent, un service… » déborde de son champ et chevauche la rangée « IMPORTER · EXPORT CSV · EXPORT PDF », qui chevauche à son tour le message « Importez des fiches avant d'exporter. » Trois textes empilés au même endroit, sur les deux vues testées. C'est le premier élément que voit un utilisateur sur téléphone — correctif proposé : masquer les libellés d'export sous un seuil de largeur, ou replier la recherche en icône ; non appliqué

---

## À NETTOYER
Objets créés pendant la campagne, à supprimer manuellement par Laurent.
**En base de PRODUCTION (`xucmfdggetwxmpquqjvj`).** Ligne écrite AVANT chaque validation de formulaire.

| Objet | Emplacement | Créé le |
|---|---|---|
| ~~10 fiches `[TEST]` + 2 pôles — 2e passe~~ — **supprimées par l'agent**, vérifié en base : 0 fiche dans `ceglialaurent workspace`, les 5 de « Recette staging » intactes | Workspace ceglialaurent workspace | créées puis supprimées le 2026-09-04 |
| _(2e passe annulée)_ — l import n a pas eu lieu : **session expirée** avant le dépôt du fichier. Aucune donnée créée, vérifié : le champ de fichier n existe pas hors session | — | — |
| ~~10 fiches agents `[TEST]` + 2 pôles~~ — **supprimées par l'agent le 2026-09-04**, vérifié en base : 0 fiche dans `ceglialaurent workspace`, les 5 de « Recette staging » intactes | Workspace ceglialaurent workspace | créées 09:00, supprimées 09:25 |
| _**Rien à nettoyer à ce stade.**_ L'import de 10 fiches `[TEST]` a été tenté à 03h25 et **refusé par la base** (L-20) : aucune ligne créée. L'appel de diagnostic de la RPC portait une charge **vide** et a lui aussi échoué. **Aucune écriture n'a abouti en production.** | — | — |
| ~~Nœud hybride `[TEST] Noeud 2026-09-03-01`~~ — **déjà supprimé par l'agent en L-66**, vérifié en base : plus aucune ligne `TEST` dans `hybrid_nodes` | Orchestration | créé 03:11, supprimé 03:15 |

**Données PRÉEXISTANTES repérées — à ne pas toucher** `[E2E]` `localStorage` :
20 nœuds hybrides `AGENT_IA` créés le **2026-08-11** (`marc.fbdesign.bot`, `sofia.facebook.bot`,
`clario.instadesign.bot`, `anita.instagram.bot`, `lina.lindesign.bot`, `victor.linkedin.bot`,
`hugo.pindesign.bot`, `rosa.pinterest.bot`, `nino.tikdesign.bot`, `lea.tiktok.bot`,
`gardien.marque`, `Marina`, `Pedro`, `Alain`, `Hannah`, `Eric`, `iris.xdesign.bot`,
`max.x.bot`, `zoe.ytdesign.bot`, `theo.youtube.bot`).
Clé `organigrad_hybrid_nodes_v1::1ed4895e-4151-404f-bea6-22e4a265362a`.
Ils apparaîtront en P8 : **consultation seulement**, aucune modification, aucune suppression.

## DÉCISIONS
- DÉCISION : P3 (import) placé avant P4-P7 alors que le harnais le classe en 5ᵉ position —
  le workspace est vide, sans import il n'y a rien à consulter, modifier ni exporter. — phase 0
- DÉCISION : les cas §2 à §5 de la recette des 4 rôles (admin, member, viewer, extérieur) ne
  sont pas planifiés — un seul compte, un seul rôle (`owner`). Ils seront déclarés
  `NON TESTÉ — COMPTE UNIQUE` au rapport, pas omis. — phase 0
- DÉCISION : L-79 ajouté au plan en cours de campagne (erreurs console non prévues). Total porté à 79. — P1
- DÉCISION : le fichier d'état est écrit après chaque **écran** (5 à 9 éléments) et non après chaque élément, pour tenir le volume d'écritures. La résilience à une coupure reste assurée à l'écran près. — P1
- DÉCISION : 78 éléments planifiés, contre « ~95 éléments interactifs » inventoriés par
  l'audit du 29/08. L'écart tient aux écrans que le mode LOCAL et le compte unique rendent
  inatteignables, et aux actions interdites. Il est assumé et documenté, pas subi. — phase 0

## BLOCAGES
- BLOQUÉ : **L-21, L-24 et tout le parcours P4 à P7** — ils dépendent des fiches que l'import
  devait créer. L-20 étant `CASSÉ P1`, il n'y a **aucune donnée à consulter, modifier,
  exporter ni supprimer**. Ce n'est pas un défaut de ces écrans : c'est une dépendance non
  satisfaite, exactement le cas prévu en phase 0. Ils seront parcourus **en état vide** — ce
  qui reste instructif (messages d'état vide, boutons proposés sans matière) mais ne vaut pas
  verdict sur leur fonctionnement nominal. — P3 → P7
- BLOQUÉ : L-18 — sélecteur de fichier natif, hors d'atteinte du pilote de navigateur. — P3

## PAUSES D'AUTHENTIFICATION
- 2026-09-03 02:31 — écran de connexion constaté, session non ouverte.
- 2026-09-03 02:52 — **session déjà active à la reprise** : Laurent s'est connecté de
- **2026-09-04 ~11h00 — session expirée en cours de reprise.** Constaté au retour sur l application : écran de connexion, plus de coquille applicative, donc plus de champ d import. Aucune tentative de reconnexion automatique. Pause signalée à Laurent, attente de GO.
  lui-même entre les deux relevés. Rôle `owner` confirmé au sélecteur de workspace.
  La pause prévue par le harnais n'a donc pas eu lieu à formuler.
