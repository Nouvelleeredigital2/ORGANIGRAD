# ORGANIGRAD — documentation de l'existant

État constaté le **2026-09-03**, par parcours navigateur sur **79 éléments**, en mode LOCAL
(orchestrateur non lancé), avec un compte `owner` sur la base de **production**
`xucmfdggetwxmpquqjvj`.

Ce document décrit ce que l'application **fait**, pas ce qu'elle est censée faire. Pour
l'intention, voir `README.md` ; pour l'écart entre les deux,
[`ECARTS-KB-ORGANIGRAD.md`](ECARTS-KB-ORGANIGRAD.md).

---

## 1. Ce que l'application fait réellement

### Entrer et s'authentifier — **fonctionne** `[E2E]`

Écran de connexion e-mail + mot de passe, avec lien magique et création de compte. Toute vue
est derrière la garde d'authentification. Après connexion, la barre latérale affiche le
workspace et le rôle. La déconnexion existe, mais **uniquement dans le menu du sélecteur de
workspace** — nulle part ailleurs.

### Consulter l'organigramme — **rien à consulter** `[E2E]`

Le workspace de production contient **0 fiche et 0 pôle**. L'écran principal affiche
« Sélectionnez un pôle dans la barre latérale pour afficher son organigramme », alors que la
barre latérale annonce « Aucun pôle disponible pour le moment ». **La consigne donnée est
impossible à suivre**, et aucun des deux messages ne dit d'importer.

La source de données affichée est « Jeu local embarqué » : le CSV d'amorçage `public/data.csv`,
qui ne contient **que sa ligne d'en-tête** (82 octets). C'est un libellé de *lecture initiale* :
les écritures, elles, vont bien dans Supabase (§3).

### Importer des fiches — **cassé** `[E2E]` `[CODE]`

L'aperçu d'import fonctionne parfaitement : nom du fichier, destination nommée
(« Workspace ceglialaurent workspace »), compteurs (10 lignes · 10 valides · 0 invalides ·
0 doublons), deux modes explicités (Compléter / Remplacer).

**La validation échoue.** La RPC `import_org_agents` est appelée avec six paramètres ; la base
de production n'expose que la version à cinq. PostgREST répond `PGRST202`. Vérifié dans les
deux sens par appel direct à charge vide : avec cinq paramètres, la fonction répond.

L'échec s'affiche à l'utilisateur sous la forme **`[object Object]`**.

### Modifier, supprimer, exporter des fiches — **non jugeable** `[E2E]`

Aucun de ces parcours n'a pu être évalué : ils supposent des fiches, que l'import ne crée pas.
Ce ne sont pas des écrans en bon état, ce sont des écrans **non jugés**.

### Orchestrer — **fonctionne, en simulation** `[E2E]`

C'est la partie la plus aboutie de l'application. Un bandeau annonce honnêtement l'état :
« Mode local · transitions simulées (configurer l'orchestrateur dans Paramètres) ». La création
de nœud, l'édition, l'exécution, le journal d'activité et la suppression fonctionnent tous.

Vingt nœuds `AGENT_IA` préexistent, importés depuis LINK le 2026-08-11 (`marc.fbdesign.bot`,
`gardien.marque`, Marina, Pedro…).

**Mais l'écriture ne passe pas par où on croit** : sans aucun orchestrateur configuré, la
création écrit **directement dans Supabase de production**, sans le dire, et le prompt système
y est stocké **en clair** (vérifié par une sonde anodine, relue en base). Le journal affiche
« Nœud créé », comme si l'orchestrateur avait travaillé.

Les transitions, elles, ne sont **pas** persistées : `node_transitions` reste vide, le statut en
base ne bouge pas. Le journal d'activité est un flux volatile, conforme à ce que le bandeau annonce.

### Administrer — **fonctionne, sur un périmètre étroit** `[E2E]`

Membres et clés API se comportent correctement (§5). Ce qui manque, manque partout : pas de
gestion de workspace, pas de recherche ni de pagination, pas d'actions en masse, et un journal
d'audit écrit mais invisible.

---

## 2. Cartographie des écrans

Routage **par paramètre d'URL**, jamais par chemin : `?v=<vue>`, la vue `orgchart` étant celle
par défaut (son `?v=` est retiré de l'URL). Autres clés : `pole`, `agent`, `node`, `edit=1`,
plus `?invite=` hors routeur. Une valeur inconnue est ignorée sans erreur et retirée de l'URL.

| Route | Rôle requis | Éléments interactifs | Fonctionnels | Sources |
|---|---|---|---|---|
| `/` (`orgchart`) | authentifié | zone d'organigramme, bascule Vue Hybride, **bouton « Reset »**, export par lots | non jugeable (vide) ; « Reset » **non testé, interdit** | `[E2E]` `[CODE]` `App.tsx:400-410` |
| `?v=dashboard` | authentifié | 3 compteurs, 2 graphiques | compteurs **OK** (0/0/0, sans `NaN`) ; graphiques **vides sans explication** | `[E2E]` |
| `?v=orchestration` | authentifié | Lancer la chaîne, Réinitialiser, Nouveau nœud, recherche, 4 filtres, et par carte : Éditer / Supprimer / Run | **OK en simulation** ; écriture réelle en base (§3) | `[E2E]` |
| `?v=members` | `owner`/`admin` | formulaire d'invitation (e-mail, rôle, Inviter), liste des membres, invitations en attente | **OK** en lecture ; invitation **non soumise** (interdit) | `[E2E]` |
| `?v=api-keys` | `owner`/`admin` | champ « Nom de la clé », « Créer la clé », révocation | **OK** en lecture ; création et révocation **non testées** (interdit) | `[E2E]` |
| `?v=settings` | authentifié | source locale/distante, connexion orchestrateur (URL + clé), import bots LINK, vider le cache, Zone de Danger | **OK** en lecture ; aucun champ rempli | `[E2E]` |
| Barre supérieure (toutes vues) | authentifié | recherche, Spotlight `⌘K`, IMPORTER, EXPORT CSV, EXPORT PDF | Spotlight **OK** ; import **cassé** ; exports sans retour perceptible | `[E2E]` |
| Barre latérale (toutes vues) | authentifié | 6 destinations, sélecteur de workspace, déconnexion, export par lots, panneaux Source et Pôles | **OK**, sauf : menu non refermable par `Échap`, libellés sans accents | `[E2E]` |

**Les six vues déclarées dans le code sont toutes atteignables.** Aucune route documentée
manquante, aucune route codée inaccessible — le désaccord que la phase 0 cherche n'existe pas.

---

## 3. Entités et cycle de vie observés

| Entité | Réellement créable | Modifiable | Supprimable | Par qui, et où |
|---|---|---|---|---|
| `org_agents` (fiches) | **non** — l'import échoue ; aucune création manuelle n'existe | non jugeable | non jugeable | — |
| `hybrid_nodes` | **oui** — éditeur complet, trois archétypes | **oui** | **oui**, avec confirmation nommant l'objet | `owner` ; **écrit directement dans Supabase**, pas via l'orchestrateur |
| `node_transitions` | **non** en mode local — table vide après exécution | — | — | le journal d'activité est volatile |
| `workspace_members` | non testé (invitation interdite) | non testé | non testé | — |
| `workspace_api_keys` | non testé (interdit) | — | non testé | une clé en service, préfixe seul affiché |
| `audit_log` | **écrit** (la table contient des lignes) | — | — | **lu par aucune vue** |
| `workspaces` | **non** — aucun CRUD dans l'interface | non | non | — |

**Ce qu'on retient du cycle de vie réel** : la seule entité pilotable de bout en bout est le
nœud hybride. Tout le versant RH est inerte tant que l'import ne passe pas.

---

## 4. Générations : comportement réel

| Génération | Déclencheur | Comportement observé | Délai |
|---|---|---|---|
| Import CSV/XLSX | champ de fichier | aperçu correct, **puis échec `PGRST202`** affiché `[object Object]` | < 1 s |
| Export CSV | « EXPORT CSV » | **aucun changement perceptible** sur organigramme vide | immédiat |
| Export PDF | « EXPORT PDF » | aperçu **non ouvert** (`canExport` faux) | — |
| Export par lots A3 | lien latéral | **rien, silencieusement** (`App.tsx:179`, `return` nu) | immédiat |

**Taux d'échec observé : aucun fichier produit, aucun fichier ouvert.** La règle « un PDF blanc
ou une image de 0 octet est un CASSÉ » n'a pas pu s'appliquer, faute de fichier.

Deux temporisations figées dans le code, non observables ici : **800 ms** avant l'export PDF
(`App.tsx:142`) et **1 200 ms par pôle** pour l'export par lots (`App.tsx:192-194`) — délais
indépendants de la taille de l'organigramme.

---

## 5. Espace admin : état réel

### Verdict : **PRÊT AVEC RÉSERVES**

Exploitable par un administrateur non technique pour gérer des membres et des clés sur un
petit périmètre. **Pas** pour gérer un organigramme — le versant RH est inaccessible tant que
l'import échoue.

Ce qui tient, vérifié à l'écran : rôle affiché en badge · états vides explicites et accentués ·
liste de rôles d'invitation qui **ne propose jamais `owner`** · e-mail invalide refusé par le
navigateur avant tout envoi · clés API réduites à leur préfixe, avec l'explication juste
(« le token complet n'est affiché qu'une seule fois ») · confirmation nommant l'objet avant
toute suppression · réglages honnêtes (« vider le cache … ce n'est pas une suppression »).

Blocages, par ordre de gravité :

1. **Bouton « Reset »** affiché en permanence sur l'organigramme, sans contrôle de rôle à
   l'affichage : il vide tout le workspace, irréversiblement. Le refus n'arrive qu'au clic.
2. **`audit_log` invisible** : la table est alimentée, aucune vue ne l'expose. Un administrateur
   ne peut pas savoir qui a fait quoi.
3. **Aucune gestion de workspace** dans l'interface.
4. **Ni recherche, ni tri, ni pagination, ni action en masse** sur les listes.
5. **Messages d'erreur** : le seul rencontré était `[object Object]`.

---

## 6. Limites de cette documentation

Elle décrit **un** état, **une** configuration, **un** rôle. Ce qu'elle ne couvre pas :

- **Les rôles `admin`, `member`, `viewer` et l'utilisateur extérieur** — un seul compte
  disponible, `owner`. Les sections 2 à 5 de la recette des 4 rôles restent entières.
- **L'orchestration réelle** — transitions, flux SSE, validation humaine, notifications : tout
  cela suppose l'orchestrateur lancé et une clé posée à la main. Rien de ce qui est écrit ici
  ne vaut pour ce mode.
- **Le versant RH complet** — création, modification, suppression, hiérarchie, exports sur
  données réelles : suspendus à l'import.
- **Les fichiers produits** — aucun export n'a abouti ; leur contenu n'a jamais été inspecté.
- **Le sélecteur de fichier natif** et les dialogues `confirm()` — hors d'atteinte du pilote ;
  l'import et la suppression ont été déclenchés par instrumentation, et le chemin par
  l'interface reste à vérifier à la main.
- **La production servie aux utilisateurs** — tout ce document décrit l'application lancée en
  local sur `localhost:5173`. Elle vise la **même base** que la production, mais le bundle servi
  à `https://organigrad.nouvelleeredigital.fr` est **antérieur** : `[KB]`
  `etat-production-2026-09-02.md` §3 indique qu'il appelle encore `import_org_agents` avec cinq
  arguments. **Il est donc probable que l'import fonctionne en production alors qu'il échoue en
  local** — l'inverse exact de ce qu'on croirait. `[À CONFIRMER]` : non vérifié, la campagne
  n'a pas testé l'URL publique.
- **Trois erreurs réseau au chargement** (`401`, `400`, et un `404` qui est le favicon absent)
  restent inexpliquées. Toutes les tables interrogées répondent pourtant correctement.
