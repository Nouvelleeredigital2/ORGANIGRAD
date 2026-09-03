# Contexte — ORGANIGRAD

Produit le 2026-09-03 (phase B du prompt 04), à partir de la base de connaissance inventoriée
dans [`KB-INVENTAIRE.md`](KB-INVENTAIRE.md) et du code du dépôt.
Campagne prévue en **CONSTAT**, orchestrateur **LOCAL** — cf. `HARNESS-E2E/01-CONFIG.md`.

---

## ⚠️ AVERTISSEMENT PRÉALABLE — la base locale est la base de PRODUCTION

`[CODE]` `.env.local` : `VITE_SUPABASE_URL=https://xucmfdggetwxmpquqjvj.supabase.co`
`[KB]` `docs/etat-production-2026-09-02.md` §Moyens : le projet de production est
`xucmfdggetwxmpquqjvj`, identité confirmée par `get_project_url`.
`[KB]` `CLAUDE.md` §13 : `xucmfdggetwxmpquqjvj` = Organigrad.

**Les trois se recoupent : l'application lancée en local écrit dans la base de production.**
Il n'existe pas de projet Supabase de test — `docs/etat-production-2026-09-02.md` §6 liste
« tests connectés sur un projet Supabase **de test** » comme une action encore à faire,
« une fois le projet fourni ». La recette des 4 rôles est d'ailleurs conditionnée à ce même
projet (`docs/plans/2026-08-14-recette-manuelle-4-roles.md`, en tête : « à exécuter après B2 »).

Conséquences pour la campagne, non négociables :

1. Toute fiche, tout nœud, toute invitation créés pendant le test sont **des données de
   production**. Le préfixe `[TEST]` (`01-CONFIG.md §6`) n'est pas une précaution
   cosmétique : c'est le seul moyen de les retrouver pour les supprimer.
2. La section `À NETTOYER` du fichier d'état doit être tenue à jour **à chaque création**,
   pas en fin de campagne.
3. Rien ne doit être supprimé ni modifié qui ne porte pas le préfixe `[TEST]` (§5 de la fiche).
4. `[À CONFIRMER]` — le compte `ceglialaurent@gmail.com` est probablement `owner` du
   workspace de production. Un `owner` peut tout casser : c'est le rôle le plus dangereux
   pour une campagne, et c'est celui dont on dispose.

Si tu préfères ne pas écrire du tout en production, la campagne se réduit à un parcours de
**lecture** : consultation, navigation, filtres, exports. C'est un arbitrage à rendre avant
le prompt 02, pas pendant.

---

## 1. Raison d'être

`[KB]` `README.md` : Organigrad est une plateforme d'**orchestration hybride Humain · IA · MCP** —
« un organigramme exécutable où chaque nœud est un humain (garant/validation), un agent IA,
ou un logiciel via MCP ». Le flux avance d'un nœud à l'autre sous contrôle d'une machine à
états, avec **validation humaine (HITL)**, notifications et audit.

Deux usages superposés, qu'il ne faut pas confondre en testant :

- un **organigramme RH** — des fiches agents, une hiérarchie de pôles, importées par CSV/XLSX,
  consultables et exportables ;
- une **orchestration exécutable** — des nœuds hybrides que l'on lance, qui passent par des
  états, et qu'un humain approuve ou refuse.

`[KB]` `AUDIT-ORGANIGRAD-2026-08-29.md` Phase 3 : le tableau de bord est « purement RH ».
Les deux mondes cohabitent dans la même application sans se rejoindre complètement.

Pour qui : un administrateur de workspace, non technique, sur un petit périmètre —
`[KB]` même audit : « exploitable par un admin non technique sur un petit périmètre
(1 workspace, ≤ ~30 personnes, tant que rien n'échoue) ; NON PRÊT au-delà ».

---

## 2. Rattachement à l'écosystème

`[KB]` `CLAUDE.md` §3 (règle d'or) : **« Organigrad décide »** — il porte l'état métier
officiel : jobs, validations, statuts. Synapse transporte et journalise ; Hermès exécute ou
notifie sans jamais décider ; LINK est la surface humaine.

`[KB]` `CLAUDE.md` §11 : Organigrad s'authentifie auprès du bus Synapse par **compte de
service Supabase** (JWT vérifié par `sb.auth.getUser`), et non par jeton applicatif — c'est
l'une des trois applications dans ce cas, précisément parce qu'elle doit **lire et décider**,
ce qu'un jeton applicatif ne permet pas.

`[CODE]` `orchestrator/src/api/bootstrap.ts:57-66` : Organigrad **émet** déjà sur le bus
(hop 1 via le moteur, hop 5 sur approve/reject) mais **n'y écoute pas encore** ; le consumer
est derrière `SYNAPSE_CONSUMER=1`, avec un prérequis explicite avant activation durable
(cloisonner la file par workspace).

`[KB]` `CLAUDE.md` §5 et §13 : port local **3001** (orchestrateur) / **5173** (SPA) ;
projet Supabase **`xucmfdggetwxmpquqjvj`** ; dépôt `Nouvelleeredigital2/ORGANIGRAD`.
`[KB]` `docs/etat-production-2026-09-02.md` : en production, la SPA est servie par le
conteneur `organigrad-front` (`nginx:alpine`, `127.0.0.1:3075`) sur la VM `srv1017182`, à
`https://organigrad.nouvelleeredigital.fr`.

**Contrat partagé** `[KB]` `CLAUDE.md` §4 : `@apps2026/contracts` 1.1.2, vendoré —
`[KB]` audit du 29/08 : version **1.1.1** vendorée dans `orchestrator/`. Écart mineur à
ne pas confondre avec un défaut.

---

## 3. Rôles et droits attendus

| Rôle | Accès attendu | Source |
|---|---|---|
| `owner` | Tout, y compris ce qu'un admin ne peut pas : être rétrogradé ou évincé est refusé | `[KB]` README §11 · `[CODE]` `src/auth/permissions.ts:56-58` |
| `admin` | Membres (inviter, changer un rôle, retirer sauf l'owner), clés API (créer/révoquer), orchestration, HITL, export, modification et suppression de fiches | `[KB]` `docs/plans/2026-08-14-recette-manuelle-4-roles.md` §2 |
| `member` | Écrit mais n'administre pas : modifie une fiche, crée et lance un nœud, approuve/refuse, réinitialise. **Ne supprime pas** une fiche. Les vues `members` et `api-keys` s'ouvrent mais **n'offrent rien** | même source §3 |
| `viewer` | Lecture seule : organigramme, fiche, recherche, tableau de bord, export PDF. **Aucun** mode Édition, même en forçant `?edit=1` | même source §4 |
| extérieur | Arrive sur **son** workspace ; ne voit ni ne devine celui d'un autre | même source §5 |

**Deux identités distinctes** `[KB]` README §11 : les humains (session Supabase + rôle dans
`workspace_members`, protégés par RLS) et les **clés API techniques** (`ok_…`, hachées
SHA-256, porteuses de scopes). Règle structurante : *« une clé technique ne reçoit jamais les
scopes humains (`human:*`, `node:reset`, `workspace:admin`) : un agent ne peut donc pas
contourner la validation humaine »*.

**Le front n'est que du masquage** `[CODE]` `src/auth/permissions.ts:10-13`, confirmé
`[KB]` audit Phase 3 : la barrière réelle est la RLS. Un écran qui cache un bouton ne prouve
rien sur la sécurité — mais un écran qui **montre** un bouton interdit est un défaut, même si
le serveur refuse ensuite. `[KB]` recette 4 rôles, règle de lecture : *« proposer puis échouer
est pire que ne pas proposer »*. **C'est le fil rouge à appliquer pendant toute la campagne.**

---

## 4. Entités métier

| Entité | Champs structurants | Cycle de vie attendu | Source |
|---|---|---|---|
| `workspace` | nom, `owner_id` | Créé hors interface — **aucun CRUD workspace dans l'UI**, alors que les policies SQL existent | `[KB]` audit Phase 3 |
| `workspace_members` | `workspace_id`, `user_id`, `role` | Invitation → acceptation → changement de rôle → retrait (suppression **définitive**) | `[KB]` README §11 |
| `workspace_invitations` | e-mail, token, expiration | En attente → acceptée / révoquée (suppression **logique**) ; expirées « sans trace ni renvoi » | `[KB]` audit Phase 3 |
| `workspace_api_keys` | préfixe, hash SHA-256, `scopes`, `expires_at`, `revoked_at` | Création (valeur affichée **une seule fois**) → révocation (`revoked_at`, jamais de suppression, pour l'audit) | `[KB]` README §12 |
| `org_agents` (fiches RH) | identité, pôle, `roleTitre`, rattachement hiérarchique, `skills`, `avatarUrl` | Import CSV/XLSX → modification → suppression **définitive** (les rattachements sont repris par le supérieur) | `[KB]` recette §1.2-1.4 |
| `hybrid_nodes` | type (humain / IA / MCP), parent, configuration, statut | Création → exécution (`run`, `run-flow`) → attente de validation → approuvé / refusé → réinitialisation | `[KB]` README §9 |
| `node_transitions` | horodatage, statut | Journal volatile des 30 dernières transitions | `[KB]` audit Phase 3 |
| `notifications` | canal (email, Slack, Telegram), `idempotency_key` | Émission idempotente | `[KB]` README §10 |
| `audit_log` | acteur, action | **Écrit, mais lu nulle part dans le front** | `[KB]` audit Phase 3 |

Verrou optimiste sur `updated_at` pour `hybrid_nodes` et `org_agents` `[KB]`
`docs/architecture/concurrence-ecritures.md` et `reste-a-faire-production-2026-09-01.md` §1 :
une modification périmée est refusée par un `409` explicite au lieu d'être écrasée.

---

## 5. Parcours utilisateurs attendus

Les cinq premiers viennent de `[KB]` `docs/plans/2026-08-14-recette-manuelle-4-roles.md`,
qui numérote 40 cas. **C'est le plan de test de référence** : la phase 0 du prompt 02 doit
s'en inspirer plutôt que d'inventer un parcours.

**P1 — Entrée et authentification.** Écran de connexion (e-mail + mot de passe, lien magique,
création de compte) → session ouverte → le sélecteur de workspace affiche le rôle.
`[KB]` audit Phase 2 parcours 1 : « FLUIDE ». Garde unique `AuthGate`
`[CODE]` `src/App.tsx:480-491`, le `?v=` est préservé après connexion.

**P2 — Organigramme (vue par défaut).** Consultation, ouverture d'une fiche, navigation par
pôle, recherche Spotlight (`⌘K`), lien profond `?agent=<id>`, `?pole=`.

**P3 — Import d'une source RH.** Réglages → fichier local CSV/XLSX → aperçu → fiches visibles
dans l'organigramme (recette 1.2). Limites d'import bornées `[KB]` README §10.

**P4 — Modification d'une fiche.** Mode Édition (`?edit=1`) → Profil → Enregistrer →
**la modification tient après rechargement** (recette 1.3). Puis suppression, avec reprise des
rattachements par le supérieur (recette 1.4).

**P5 — Administration.** `?v=members` : liste, formulaire d'invitation, invitation d'une
adresse réelle, copie du lien, révocation (recette 1.5-1.7). `?v=api-keys` : création — le
token complet s'affiche **une seule fois**, disparaît au rechargement — puis révocation
(recette 1.8-1.10). **Ces trois derniers cas sont interdits à l'agent** (`01-CONFIG.md §5`).

**P6 — Orchestration et HITL.** Créer un nœud, le lancer, voir le statut et le journal
d'activité, amener un nœud en attente de validation, refuser, relancer, remettre en attente,
approuver depuis le Centre de validation (recette 1.11-1.14). **Simulé en mode LOCAL.**

**P7 — Générations.** Export PDF : Aperçu → Télécharger → fichier **ouvrable**, contenu
correct. Export par lots : **un fichier par pôle**, tous ouvrables (recette 1.15-1.16).
Export CSV `[CODE]` `src/services/csvService.ts`.

**P8 — Transversal.** Deux onglets et changement de rôle ; coupure réseau pendant un
enregistrement (message clair, **aucun faux succès**, saisie conservée) ; session invalidée
(message « Ta session a expiré… », saisie conservée) — recette §6.

---

## 6. Générations attendues

| Génération | Déclencheur | Format attendu | Contrainte | Source |
|---|---|---|---|---|
| Export PDF d'une fiche / d'un pôle | Aperçu puis « Télécharger le PDF » | PDF ouvrable, contenu conforme | `[KB]` recette 1.15 : **si le bouton est hors écran, noter la résolution** — le cas 1280×720 est corrigé, les autres tailles jamais essayées | `[CODE]` `src/services/exportPdf.ts` |
| Export PDF par lots | Action d'export groupé | **un fichier par pôle**, tous ouvrables | recette 1.16 | idem |
| Export CSV | Action d'export | CSV | `[KB]` audit P2 : **export CSV sans gestion d'échec** (`src/App.tsx:214-225`) — un échec peut passer inaperçu | `[CODE]` `src/services/csvService.ts` |
| Import CSV/XLSX | Réglages → fichier | Aperçu puis fiches en base | Limites de taille, feuilles, lignes, colonnes, cellules ; neutralisation de l'injection de formules | `[KB]` README §10 |
| E-mail HITL | Passage en attente de validation | Un e-mail par occurrence | **Ne partiront pas** : cf. §8 | `[KB]` `etat-production-2026-09-02.md` §4.1 |

`[KB]` audit P3 : « délai magique 800 ms » dans `exportPdf` — un export lent peut donc
produire un fichier incomplet sans erreur. À vérifier à l'écran, c'est exactement ce qu'un
test statique ne peut pas trancher.

---

## 7. Espace admin attendu

**Il n'y a pas d'espace admin séparé** : deux vues de la même SPA, `?v=members` et
`?v=api-keys`, réservées aux rôles `owner`/`admin`
`[CODE]` `src/components/views/adminGuards.ts:1-14`.

`[KB]` audit du 29/08, Phase 3 — verdict : **PRÊT AVEC RÉSERVES**.

Point fort vérifié : le contrôle d'accès. `?v=members` sans rôle admin s'ouvre en lecture
sans action ; `?v=api-keys` **ne charge rien** (`ApiKeysView.tsx:49`).

Réserves annoncées, à retrouver ou non à l'écran :
aucun CRUD workspace dans l'UI · invitations **sans e-mail** (copier-coller manuel) et
expirées sans trace ni renvoi · aucune recherche, tri, pagination ni action en masse ·
exports limités aux agents · `audit_log` écrit mais **invisible** · changement de rôle
appliqué au `onChange` **sans confirmation** (`MembersView.tsx:421-428`) · suppressions
logiques et définitives incohérentes, sans corbeille · messages d'erreur techniques bruts
(anglais Supabase, codes PL/pgSQL, `err.message` PostgREST, trois `alert()` natifs) ·
**« Zone de Danger » visible par tous les rôles** (`SettingsView.tsx:355-367`), refus
seulement au clic.

---

## 8. Écarts KB ↔ code, relevés dès maintenant

| # | Point | Ce que dit la base | Ce que dit le code / le constat | Sévérité |
|---|---|---|---|---|
| E1 | Port de la SPA | `CLAUDE.md` §5 : 5173 | `.claude/launch.json` force **5199** `--strictPort` ; `vite.config.ts` ne surcharge rien ; **5173 constaté à l'écran** le 03/09 | P2 — piège de démarrage |
| E2 | Base ciblée en local | Aucun document ne dit que le dev local écrit en production | `.env.local` pointe `xucmfdggetwxmpquqjvj`, **le projet de production** | **P1** — risque de données |
| E3 | Projet de test | La recette des 4 rôles suppose un projet de test (B2) | Il n'existe pas ; `etat-production` §6 le liste comme à fournir | P1 — la recette de référence n'est pas exécutable telle quelle |
| E4 | Version du contrat | `CLAUDE.md` §4 : `@apps2026/contracts` **1.1.2** | Audit du 29/08 : **1.1.1** vendorée dans `orchestrator/` | P3 |
| E5 | Mode local non documenté côté README | README §3 : sans `VITE_ORCHESTRATOR_URL` → « mode brouillon » | `[CODE]` `useOrchestratorConfig.ts:13` : la configuration vient du **localStorage**, pas de la variable d'environnement. La variable est présente dans `.env.local` et **n'est lue nulle part** dans `src/` | P2 — la documentation décrit un mécanisme qui n'est pas celui du code |
| E6 | Écriture directe quand l'orchestrateur est éteint | — | `[KB]` audit **P1 n°3 fonctionnel** : orchestrateur *configuré mais éteint* → les écritures basculent en Supabase direct, **secrets en clair**, message « Nœud créé » **sans avertissement** (`OrchestrationView.tsx:473-476`) | **P1** |
| E7 | Nombre d'applications dans la racine | `CLAUDE.md` §1 : ~45 dossiers | 119 entrées de premier niveau | P3 — documentation de la racine, pas d'Organigrad |

E5 mérite une précision, parce qu'il change la conduite du test : `VITE_ORCHESTRATOR_URL`
figure dans `.env.example` et dans `.env.local`, le README lui donne un rôle — et une
recherche sur `src/` ne la trouve nulle part. `[À CONFIRMER]` : soit elle est morte, soit
elle est lue par un chemin que je n'ai pas identifié. Dans les deux cas, **poser cette
variable ne connectera pas l'orchestrateur** : seul le localStorage le fait.

---

## 9. Zones d'ombre

Ce que la documentation ne couvre pas, et qu'il faudra caractériser en testant.

1. **Le rôle réel du compte de test.** Aucun document ne dit quel rôle
   `ceglialaurent@gmail.com` détient dans le workspace de production, ni combien de
   workspaces existent. Tout le plan des rôles en dépend : à lire dans le sélecteur de
   workspace au premier écran, et à inscrire avant toute autre chose.
2. **L'état réel des données de production.** Combien de fiches, combien de pôles, combien de
   nœuds ? Un organigramme vide et un organigramme à 200 fiches ne se testent pas pareil, et
   la troncature silencieuse au `max-rows` PostgREST signalée `[À CONFIRMER]` par l'audit ne
   se voit qu'au-delà d'un certain volume.
3. **Ce que fait l'application quand l'orchestrateur n'a jamais été configuré** — par
   opposition au cas documenté « configuré mais éteint » (E6). L'audit décrit le second, pas
   le premier. C'est exactement la situation de cette campagne.
4. **Le comportement des e-mails.** `[KB]` `etat-production-2026-09-02.md` §4.1 :
   `notify-email` est déployée mais, **sans `RESEND_API_KEY`, elle répond `ok: true` sans rien
   envoyer**. Toute vérification d'e-mail pendant la campagne constatera donc un succès
   apparent et une absence de réception. **À ne pas rapporter comme une découverte** : c'est
   documenté, et c'est un recul assumé.
5. **Le point 1.13 de la recette** — deuxième passage en attente de validation, deuxième
   e-mail — est déclaré « corrigé, jamais vérifié de bout en bout ». Il est hors d'atteinte
   en mode LOCAL et sans e-mails. Il restera ouvert après cette campagne.
6. **Les tailles d'écran autres que 1280×720** pour le bouton « Télécharger le PDF »
   (recette 1.15). Le harnais teste dans une fenêtre dont la taille n'est pas celle-là :
   le noter plutôt que de conclure.
7. **Les trois dossiers de maquettes** `Fiche_Agent_Mode_Edition/`, `Organigramme_Dynamique/`,
   `Tableau_de_Bord_Horizontale/` — `[KB]` audit Phase 0 : « maquettes HTML statiques ».
   Aucune documentation ne dit si elles décrivent l'état visé ou un état abandonné. Ne pas les
   traiter comme une spécification.
8. **Ce que l'audit du 29/08 affirme et que personne n'a vérifié à l'écran.** Il annonce
   « ~95 éléments interactifs, aucun cassé, aucun placeholder, zéro bouton mort » — sur
   **lecture de code**. C'est précisément ce que cette campagne doit confirmer ou démentir :
   un bouton câblé dans le code peut être invisible, hors écran, ou sans effet perceptible.
   **Si la campagne ne trouve rien, c'est la couverture qu'il faut interroger**, pas
   l'application (`06-TEMPLATE-RAPPORT.md`, règles de rédaction).
9. **La rupture annoncée du parcours CRUD agent** — `agentsStale`/`agentsError` calculés mais
   jamais affichés (`useOrgChartController.ts:474-477`), donc « cache périmé présenté comme
   courant ». Invisible par construction : il faudra provoquer la péremption pour la voir.
10. **La désynchronisation d'ids après import** (P1 n°4 de l'audit) : la première édition ou
    suppression après un import CSV échouerait sur `invalid input syntax for type uuid`.
    Testable **seulement en important**, donc en écrivant en production (§ avertissement).
