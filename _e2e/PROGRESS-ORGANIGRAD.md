# E2E ORGANIGRAD — campagne du 2026-09-03

Mode        : CONSTAT · Orchestrateur : LOCAL · Écriture : AUTORISÉE (base de production)
Branche     : e2e/organigrad-2026-09-03
URL         : http://localhost:5173
Progression : 0/78
Dernière MAJ: 2026-09-03 02:55

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
- [ ] L-01 Écran de connexion — champs, lien magique, création de compte (`[E2E]` vu avant session)
- [ ] L-02 Barre latérale — 6 destinations, la vue active est signalée
- [ ] L-03 Sélecteur de workspace — nom et rôle affichés, contenu du menu
- [ ] L-04 Barre supérieure — recherche « Rechercher un agent, un service… »
- [ ] L-05 Spotlight `⌘K` — ouverture, saisie, fermeture (`Échap`)
- [ ] L-06 Panneau SOURCE — libellé « Jeu local embarqué » et texte d'aide
- [ ] L-07 Panneau PÔLES — état vide « Aucun pôle disponible pour le moment »
- [ ] L-08 Lien « Export par lots A3 (tous les pôles) » sur un organigramme vide
- [ ] L-09 Déconnexion — présence et emplacement (dans le menu workspace, P3 audit)

## P2 — Session authentifiée : tableau de bord (`?v=dashboard`)
- [ ] L-10 Compteur « Effectif total » — cohérent avec les données réelles
- [ ] L-11 Compteur « Moyenne NBI »
- [ ] L-12 Compteur « Pôles actifs »
- [ ] L-13 Graphique « Répartition des Temps » — état vide
- [ ] L-14 Graphique « Top Pôles (Effectifs) » — état vide
- [ ] L-15 Message « Importez des fiches avant d'exporter » — cohérence avec l'état vide
- [ ] L-16 Bas de page du tableau de bord — éléments hors de la première vue

## P3 — Création de la matière : import (`?v=settings` → fichier)
- [ ] L-17 Générer la fixture `_e2e/fixtures/agents-test.csv` (10 lignes, toutes `[TEST]`)
- [ ] L-18 Bouton « IMPORTER » de la barre supérieure — ouverture du sélecteur
- [ ] L-19 Modale d'aperçu d'import — colonnes détectées, correspondance des champs
- [ ] L-20 Validation de l'import — les fiches apparaissent dans l'organigramme
- [ ] L-21 Persistance après rechargement de la page ⚠️ **le test qui compte**
- [ ] L-22 Où sont écrites les fiches : Supabase ou cache local ? (tranche D3)
- [ ] L-23 Import d'un fichier malformé — message d'erreur compréhensible
- [ ] L-24 Filament d'import de la barre supérieure — `[KB]` P3 : annonce « success » avant l'import réel
- [ ] L-25 Réglages : champ d'URL CSV distante — présence, sans le remplir

## P4 — Consultation, recherche, navigation (`?v=orgchart`)
- [ ] L-26 Organigramme peuplé — hiérarchie et rattachements
- [ ] L-27 Ouvrir une fiche `[TEST]` — modale de profil
- [ ] L-28 Navigation par pôle — panneau PÔLES alimenté
- [ ] L-29 Paramètre d'URL `?pole=`
- [ ] L-30 Paramètre d'URL `?agent=<id>` à froid ⚠️ `[KB]` P1 n°5 : surlignage inopérant dans un onglet neuf
- [ ] L-31 Recherche Spotlight sur une fiche `[TEST]`
- [ ] L-32 Recherche sans résultat — retour à l'utilisateur
- [ ] L-33 Vue Hybride de l'organigramme — `[KB]` P3 : Run/Valider/Éditer non transmis
- [ ] L-34 Accessibilité clavier des nœuds — `[KB]` P3 : `<div onClick>` non focalisables

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
- [ ] L-55 État de connexion affiché — attendu « Mode local · transitions simulées »
- [ ] L-56 Créer un nœud `[TEST]` — éditeur de nœud
- [ ] L-57 Enregistrer — anti double-clic ⚠️ `[KB]` P2 : absent (`NodeEditor.tsx:353-359`)
- [ ] L-58 Où est écrit le nœud en l'absence d'orchestrateur ? ⚠️ `[KB]` **P1** : bascule Supabase directe, secrets en clair, sans avertissement
- [ ] L-59 Bouton « Run » d'une carte — anti double-clic ⚠️ `[KB]` P2 : absent
- [ ] L-60 Transition de statut — **simulée**, à marquer comme telle
- [ ] L-61 Journal d'activité — alimenté, 30 dernières transitions
- [ ] L-62 Centre de validation — approuver / refuser (simulés)
- [ ] L-63 Réinitialiser un nœud
- [ ] L-64 Micro vocal ⚠️ `[KB]` P2 : transcription non branchée, erreur visible en `title` seulement
- [ ] L-65 Modale de détails d'un nœud — livrable cherché dans les 50 dernières transitions
- [ ] L-66 Supprimer le nœud `[TEST]` — nettoyage

## P9 — Espace admin et écrans périphériques
- [ ] L-67 `?v=members` — liste des membres, rôle affiché
- [ ] L-68 Formulaire d'invitation — **ouvrir, décrire, ne pas soumettre** (action interdite)
- [ ] L-69 Sélecteur de rôle ⚠️ `[KB]` P3 : appliqué au `onChange`, sans confirmation — **ne pas y toucher**
- [ ] L-70 Validation du format d'e-mail d'invitation ⚠️ `[KB]` : la RPC accepte `"abc"` — testable sans soumettre ?
- [ ] L-71 `?v=api-keys` — liste des clés, **lecture seule**
- [ ] L-72 Absence de valeur de clé en clair à l'écran
- [ ] L-73 `?v=settings` — inventaire des sections
- [ ] L-74 « Zone de Danger » ⚠️ `[KB]` P3 : visible par tous les rôles, refus au clic seulement — **ne pas cliquer**
- [ ] L-75 Messages d'erreur techniques bruts — `[KB]` P2 : anglais Supabase, codes PL/pgSQL, 3 `alert()`
- [ ] L-76 Journal d'audit — `[KB]` : `audit_log` écrit mais lu nulle part dans le front
- [ ] L-77 Gestion des workspaces — `[KB]` : absente de l'interface
- [ ] L-78 Comportement à 375 px de large ⚠️ `[KB]` P3 : `px-12` sur Members/ApiKeys, zones tactiles < 44 px

---

## À NETTOYER
Objets créés pendant la campagne, à supprimer manuellement par Laurent.
**En base de PRODUCTION (`xucmfdggetwxmpquqjvj`).** Ligne écrite AVANT chaque validation de formulaire.

| Objet | Emplacement | Créé le |
|---|---|---|
| _(aucun pour l'instant)_ | | |

## DÉCISIONS
- DÉCISION : P3 (import) placé avant P4-P7 alors que le harnais le classe en 5ᵉ position —
  le workspace est vide, sans import il n'y a rien à consulter, modifier ni exporter. — phase 0
- DÉCISION : les cas §2 à §5 de la recette des 4 rôles (admin, member, viewer, extérieur) ne
  sont pas planifiés — un seul compte, un seul rôle (`owner`). Ils seront déclarés
  `NON TESTÉ — COMPTE UNIQUE` au rapport, pas omis. — phase 0
- DÉCISION : 78 éléments planifiés, contre « ~95 éléments interactifs » inventoriés par
  l'audit du 29/08. L'écart tient aux écrans que le mode LOCAL et le compte unique rendent
  inatteignables, et aux actions interdites. Il est assumé et documenté, pas subi. — phase 0

## BLOCAGES
- _(aucun pour l'instant)_

## PAUSES D'AUTHENTIFICATION
- 2026-09-03 02:31 — écran de connexion constaté, session non ouverte.
- 2026-09-03 02:52 — **session déjà active à la reprise** : Laurent s'est connecté de
  lui-même entre les deux relevés. Rôle `owner` confirmé au sélecteur de workspace.
  La pause prévue par le harnais n'a donc pas eu lieu à formuler.
