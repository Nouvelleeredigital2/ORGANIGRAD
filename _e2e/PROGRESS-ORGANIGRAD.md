# E2E ORGANIGRAD — campagne du 2026-09-03

Mode        : CONSTAT · Orchestrateur : LOCAL · Écriture : AUTORISÉE (base de production)
Branche     : e2e/organigrad-2026-09-03
URL         : http://localhost:5173
Progression : 61/79
Dernière MAJ: 2026-09-03 04:10

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
- [x] L-21 Persistance après rechargement — **BLOQUÉ** — rien n'a été créé (L-20), il n'y a rien dont vérifier la persistance
- [x] L-22 Destination des écritures — **TRANCHÉ** — l'import vise bien **Supabase** (RPC `import_org_agents` sur `xucmfdggetwxmpquqjvj`), pas le cache local : `agentRepo.ts:179-206` ne prend le chemin `localStorage` que si le contexte est local, ce qui n'est pas le cas avec un workspace actif. Le désaccord D3 se résout ainsi : **Supabase est bien la source de vérité en écriture** ; « Jeu local embarqué » ne désigne que la **source de lecture initiale** (`/data.csv`, 82 octets, en-tête seul). Les deux affirmations de la base de connaissance sont exactes, elles parlent de deux choses différentes
- [x] L-23 Message d'erreur d'import — **DÉGRADÉ P1** — le seul retour affiché est **`[object Object]`**, en rouge, sous les modes d'import. Ni ce qui a échoué, ni quoi faire. Cause : `src/utils/asyncGuard.ts:21-25`, `describeError` retourne `String(err)` pour tout ce qui n'est ni `Error` ni `string` — or **les erreurs de supabase-js sont des objets simples** (`{message, code, details, hint}`), jamais des instances d'`Error`. Tout échec PostgREST de ce chemin s'affiche donc `[object Object]`, quel qu'il soit. Appelé depuis `useOrgChartController.ts:334`.

  Le message existait pourtant : la réponse portait `message`, `code`, `details` **et** `hint` — l'indice donnait même la signature attendue. Toute cette information est jetée à l'affichage — correctif proposé : lire `err.message` quand l'objet en porte un ; non appliqué
- [x] L-24 Filament d'import — **NON TESTÉ** — l'import n'ayant jamais abouti, le filament de succès n'a pas pu être observé dans les conditions que `[KB]` l'audit décrit. À reprendre quand L-20 sera corrigé
- [ ] L-25 Réglages : champ d'URL CSV distante — présence, sans le remplir

## P4 — Consultation, recherche, navigation (`?v=orgchart`)
- [x] L-26 Organigramme — **DÉGRADÉ P2 (état vide)** — l'écran affiche « Sélectionnez un pôle dans la barre latérale pour afficher son organigramme. » alors que la barre latérale annonce, elle, « Aucun pôle disponible pour le moment. » **L'écran principal donne une consigne impossible à suivre.** Deux composants décrivent le même état vide, chacun à sa façon, sans se parler — correctif proposé : un seul message d'état vide, qui dit d'importer ; non appliqué
- [x] L-27 Ouvrir une fiche — **BLOQUÉ** — aucune fiche n'existe (L-20)
- [x] L-28 Navigation par pôle — **BLOQUÉ** — aucun pôle (L-20)
- [x] L-29 `?pole=` inconnu — **OK** — `?pole=inexistant` est ignoré sans erreur ni écran cassé, et la clé est **retirée de l'URL**. `[CODE]` `appUrl.ts:72` : seules les valeurs valides sont réécrites ; `?v=orgchart` disparaît aussi, la vue étant celle par défaut. Comportement propre
- [x] L-30 `?agent=` à froid — **NON TESTABLE EN L'ÉTAT** — un UUID inexistant est ignoré proprement (aucune erreur, clé retirée de l'URL), mais le défaut `[KB]` P1 n°5 (surlignage inopérant dans un onglet neuf) exige une fiche réelle : il reste **non vérifié**, faute d'import (L-20)
- [x] L-31 Spotlight sur une fiche — **BLOQUÉ** — aucune fiche à trouver (L-20)
- [x] L-32 Recherche sans résultat — **OK** — « Aucun résultat trouvé pour … » suivi de « Vérifiez l'orthographe ou essayez un autre terme. » : message clair, accentué, orienté action
- [x] L-33 Vue Hybride de l'organigramme — **BLOQUÉ** — la bascule vit dans l'organigramme, qui n'a aucun nœud à afficher (L-20)
- [x] L-34 Accessibilité clavier — **BLOQUÉ pour l'organigramme** (vide). En revanche, côté orchestration, les cartes exposent bien un rôle bouton : `[E2E]` l'arbre d'accessibilité rend « Ouvrir la fiche de marc.fbdesign.bot » comme `button`, et « Éditer » / « Supprimer » / « Run » comme boutons nommés. Le défaut `[KB]` P3 visait `OrgChart`, `HybridNodeCard` et `ProfileModal` : **au moins HybridNodeCard ne le présente pas**

## P5 — Modification de la donnée de test
- [ ] L-35 Mode Édition — activation, et `?edit=1` dans l'URL
- [ ] L-36 Modifier un champ d'une fiche `[TEST]` — enregistrement
- [ ] L-37 Persistance après rechargement ⚠️ recette 1.3
- [ ] L-38 Première édition **après import** ⚠️ `[KB]` P1 n°4 : `invalid input syntax for type uuid` attendu
- [ ] L-39 Champs `skills` et `avatarUrl` après une modification partielle ⚠️ `[KB]` P2 : PUT partiel les efface
- [ ] L-40 Indicateur de cache périmé — `[KB]` P2 : `agentsStale` calculé mais jamais affiché
- [ ] L-41 Modification concurrente (deux onglets) — `[KB]` recette 6.4 : la seconde écrase sans avertir
- [ ] L-42 Annulation d'une modification en cours

## P6 — Générations (exports)
- [ ] L-43 « EXPORT CSV » — fichier produit, non vide, ouvrable, contenu conforme
- [ ] L-44 « EXPORT CSV » en échec — `[KB]` P2 : aucune gestion d'échec
- [ ] L-45 « EXPORT PDF » — aperçu
- [ ] L-46 « EXPORT PDF » — bouton « Télécharger » : **noter la résolution** (recette 1.15)
- [ ] L-47 PDF produit — ouvrable, non blanc, contenu conforme
- [ ] L-48 Délai d'export — `[KB]` P3 : temporisation figée à 800 ms
- [ ] L-49 « Export par lots A3 » — **un fichier par pôle**, tous ouvrables (recette 1.16)
- [ ] L-50 Export depuis un organigramme vide — comportement et message

## P7 — Suppression de la donnée de test
- [ ] L-51 Supprimer une fiche `[TEST]` — confirmation demandée
- [ ] L-52 Reprise des rattachements par le supérieur (recette 1.4)
- [ ] L-53 Persistance de la suppression après rechargement
- [ ] L-54 Supprimer toutes les fiches `[TEST]` restantes — nettoyage de la session

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
- [x] L-79 Erreurs console sur les cartes de nœuds — **DÉGRADÉ P3** — 5 erreurs React répétées : « Encountered two children with the same key, `veille` ». Cause : `src/components/HybridNodeCard.tsx:307`, `skills.map((skill) => <Pill key={skill}>)` — la clé est la valeur de la compétence, or cinq nœuds préexistants portent `skills: ["veille","veille"]` en double (Marina, Pedro, Alain, Hannah, Eric, créés le 2026-08-11). React avertit d'un risque de duplication ou d'omission d'éléments. **Trouvé hors plan**, en relevant la console pendant L-08 ; le déclencheur exact du rendu n'est pas attribué `[À CONFIRMER]` — correctif proposé : `key={`${skill}-${i}`}` ou déduplication des compétences à la lecture ; non appliqué

## P9 — Espace admin et écrans périphériques
- [x] L-67 `?v=members` — **OK** — en-tête « Workspace · ceglialaurent workspace », texte d'intention (« Invite des collaborateurs, attribue-leur un rôle, ou retire l'accès. Les invitations expirent automatiquement après 14 jours. »), « MEMBRES ACTIFS · 1 » avec le compte et son badge `OWNER`, « INVITATIONS EN ATTENTE · 0 — Aucune invitation en attente. » États vides explicites et accentués
- [x] L-68 Formulaire d'invitation — **NON TESTÉ — ACTION INTERDITE** — présent et complet : champ e-mail, liste de rôles, bouton « Inviter ». **Non soumis** : l'invitation expédie un courriel à un tiers (§5). Détail notable `[E2E]` : la liste de rôles propose `admin`, `member`, `viewer` — **jamais `owner`**, ce qui ferme proprement la promotion accidentelle
- [x] L-69 Sélecteur de rôle d'un membre — **NON TESTÉ — ACTION INTERDITE**, mais **`[KB]` l'audit paraît périmé sur ce point** : il annonce un changement de rôle « appliqué au `onChange`, sans confirmation ». Or `[CODE]` `MembersView.tsx:202` porte bien une confirmation — `if (!confirm("Changer le rôle de ... en « ... » ?")) return;`. Le défaut a vraisemblablement été corrigé depuis le 29/08 ; à faire retirer de la liste des réserves. Non vérifié à l'écran, le seul membre étant l'owner lui-même, dont le rôle n'est pas modifiable (badge, pas de liste)
- [x] L-70 Validation du format d'e-mail — **OK côté client** — le champ est un `input type="email"` **requis** : la saisie `abc` est refusée par le navigateur avant tout envoi, avec le message « Veuillez inclure "@" dans l'adresse e-mail. Il manque un symbole "@" dans "abc". » `[KB]` l'audit vise la **RPC**, qui accepte `abc` : la faiblesse serveur reste entière, mais elle n'est pas atteignable par l'interface. Champ vidé après le test, rien n'a été soumis
- [x] L-71 `?v=api-keys` — **OK** — la vue charge et liste **une clé en service** : « Import LINK · Bots Hermes », créée le 11/08/2026, **utilisée le 11/08/2026**. Formulaire de création présent (« Nom de la clé », « Créer la clé ») et bouton de révocation — **aucun des deux actionné** (§5) : cette clé fait tourner l'import des bots LINK, la révoquer casserait une intégration réelle
- [x] L-72 Absence de clé en clair — **OK** — seul le **préfixe** `ok_b91db5bf…` est affiché, jamais le token complet. L'écran l'annonce d'ailleurs : « Le token complet n'est affiché qu'une seule fois à la création — copie-le immédiatement. » Conforme à `[KB]` README §12 (hachage SHA-256, valeur montrée une fois)
- [x] L-73 `?v=settings` — **OK** — cinq sections : **Source de données** (source active, fichier local, URL distante), **Orchestrateur · Connexion** (URL de l'API + clé API workspace + « Enregistrer la connexion » — c'est bien ici que se pose le mode connecté, cf. L-58), **Bots Hermes · LINK** (import des bots, correctement verrouillé : « Enregistre d'abord la connexion orchestrateur ci-dessus »), **Orchestration · Nœuds Hybrides** (vider le cache local, avec une explication honnête : « ce n'est pas une suppression »), **Zone de Danger**. Aucun champ renseigné par l'agent
- [x] L-74 « Zone de Danger » — **NON TESTÉ — ACTION INTERDITE** — présente, avec le bouton « REINITIALISER LES DONNEES LOCALES ». Non cliqué.

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
  lui-même entre les deux relevés. Rôle `owner` confirmé au sélecteur de workspace.
  La pause prévue par le harnais n'a donc pas eu lieu à formuler.
