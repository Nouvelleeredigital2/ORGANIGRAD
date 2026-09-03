# 01 — FICHE DE SESSION — ORGANIGRAD

Pré-remplie le 2026-09-03 à partir du dépôt et de la base de connaissance.
Toute valeur porte sa source. Ce qui reste `À RENSEIGNER` est une décision qui t'appartient.
**Règle pour l'agent : si une ligne obligatoire porte encore `À RENSEIGNER`, tu t'arrêtes et tu me la demandes — c'est la seule question autorisée avant le démarrage.**

---

## 0. AVERTISSEMENTS PROPRES À CE DÉPÔT — à lire avant de démarrer

**L'application a deux modes d'exécution, et un seul vaut pour un verdict.**

`[CODE]` `src/hooks/useOrchestratorConfig.ts:9-20` : l'URL de l'orchestrateur et la clé API
workspace sont lues **dans le `localStorage`** (`organigrad_orchestrator_config_v1`), pas dans
l'environnement. Tant qu'elles sont vides, la SPA reste en mode *direct Supabase* et
**la vue Orchestration simule les transitions localement**.
`[CODE]` `src/hooks/useOrchestratorBridge.ts:26-31` : cinq états de connexion —
`local` (aucun orchestrateur configuré, transitions simulées) · `connecting` · `connected` ·
`degraded` (flux SSE interrompu) · `failed`.

**Une campagne menée en mode `local` ne teste ni l'orchestration réelle, ni les transitions
de statut, ni le flux SSE : elle ne vaut pas pour un verdict sur ces parcours.** Le premier
geste après la connexion est de lire l'indicateur d'état et de l'inscrire dans le fichier
d'état. S'il annonce « Mode local · transitions simulées », l'agent le consigne et marque
les éléments d'orchestration `NON TESTÉ — MODE LOCAL`.

**Conséquence directe sur §5.** Passer en mode connecté suppose de coller une clé API
`ok_…` dans un champ de l'interface. **C'est une action interdite à l'agent** (§5 :
saisie d'une clé d'API). Donc : ou bien tu renseignes toi-même l'URL et la clé pendant la
pause d'authentification, ou bien la campagne se limite au mode `local`. À trancher en §4
avant de lancer — c'est le seul arbitrage qui change le périmètre réel de la campagne.

**Le routage se fait par paramètre d'URL, pas par chemin.**
`[CODE]` `src/routing/appUrl.ts:16-23` : six vues — `orgchart` (défaut), `dashboard`,
`orchestration`, `members`, `api-keys`, `settings` — atteintes par `?v=…`. Il n'existe
**aucune** route `/dashboard` ou `/membres`. Un agent qui cherche des chemins conclura à
tort que l'application n'a qu'un écran. `[CODE]` `appUrl.ts:42` : les clés d'URL réservées
sont `v`, `pole`, `agent`, `node`, `edit` (`edit=1` = mode édition).

**Organigrad décide, il n'observe pas.** `[KB]` `---APPLICATION-2026---/CLAUDE.md` §3 :
Organigrad porte l'état métier officiel (jobs, validations, statuts). Une donnée créée ici
n'est pas un brouillon local anodin : elle peut être la source de vérité pour les autres
applications. Raison de plus pour préfixer strictement (§6) et tout reporter dans
`À NETTOYER`.

**État du dépôt au 2026-09-03** `[CODE]` : `git status` **vide**, branche d'origine `master`,
dernier commit `6b7822b`. La branche de campagne `e2e/organigrad-2026-09-03` a été créée
depuis `master`, le harness copié et `.gitignore` complété — **à committer avant de lancer
le prompt 02**, qui exige un dépôt propre.

---

## 1. APPLICATION CIBLE

```
APPLICATION            : ORGANIGRAD
DÉPÔT LOCAL            : C:\Users\5070 Ti\Downloads\---APPLICATION-2026---\ORGANIGRAD
BRANCHE DE TRAVAIL     : e2e/organigrad-2026-09-03        # créée depuis master, dépôt propre
URL D'ACCÈS            : http://localhost:5173
COMMANDE DE DÉMARRAGE  : npm run dev                      # + orchestrateur, voir ci-dessous
```

Provenance des valeurs, à confirmer au premier lancement :
- `[CODE]` `package.json` → `"dev": "vite"`. `vite.config.ts` **ne surcharge aucun port** :
  Vite retombe donc sur son défaut, **5173**.
- `[KB]` `---APPLICATION-2026---/CLAUDE.md` §5, table des ports : Organigrad → **3001 / 5173**.
  Les deux concordent : 5173 est la SPA, 3001 l'orchestrateur.
- `[CODE]` `orchestrator/src/config/env.ts:72` : port de l'orchestrateur = `PORT` ou **3001**
  par défaut. Lancement séparé : `npm run dev` **dans `orchestrator/`** (`tsx watch src/api/bootstrap.ts`).
- `[À CONFIRMER]` L'URL reste à valider en ouvrant le navigateur : c'est cette fiche qui fait
  foi, pas le code.

Stack `[CODE]` : Vite + React + TypeScript (paquet `orga`), Supabase, Vitest, Playwright
(`playwright.config.ts` et `playwright.connected.config.ts`). Backend séparé
`@organigrad/orchestrator` (Fastify, mode Postgres + clé API).
Projet Supabase **`xucmfdggetwxmpquqjvj`** `[KB]` `CLAUDE.md` §13 — vérifié présent dans
`.env.local` `[CODE]`. Ne jamais réutiliser la ref d'une autre application.

---

## 2. BASE DE CONNAISSANCE

```
RACINE                 : C:\Users\5070 Ti\Downloads\---APPLICATION-2026---
VUE D'ENSEMBLE         : apps2026-hub\  (ECOSYSTEM.md, RESTE_A_FAIRE_APPS2026.md,
                         ETAT_MISE_EN_LIGNE_VPS.md, docs\, plans\)
                         + CLAUDE.md (racine) et ..\CLAUDE.md (Downloads)
DOSSIER DE L'APP       : ORGANIGRAD\docs\  et ORGANIGRAD\README.md
                         + ORGANIGRAD\AUDIT-ORGANIGRAD-2026-08-29.md
```

Documents repérés dans `ORGANIGRAD\docs\` `[CODE]` : `etat-production-2026-09-02.md`,
`reste-a-faire-production-2026-09-01.md`, `audit-2026-08-22-fonctionnel.md`, `audit-initial.md`,
`final-correction-report.md`, `recette-staging-2026-08-05.md`, `synchronisation-livraison.md`,
`deployment.md`, `testing.md`, plus `architecture\`, `plans\`, `security\`.
Les deux documents les plus récents (02/09 et 01/09) sont **postérieurs à l'audit du 29/08** :
en cas de désaccord, ils l'emportent, et l'écart est à signaler en phase A.

Ce dépôt n'a **pas** de `CLAUDE.md` propre `[CODE]` : le cadrage vient de la racine.

Chemin Windows contenant espaces et tirets : toujours entre guillemets dans les commandes.
Accès en **lecture seule**. Aucun fichier de cette racine n'est modifié, déplacé ou supprimé.

---

## 3. AUTHENTIFICATION

```
COMPTE                 : ceglialaurent@gmail.com
QUI SE CONNECTE        : Laurent, manuellement, dans le navigateur
MOT DE PASSE           : jamais transmis, jamais saisi par l'agent
```

`.env.local` est présent et renseigne `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
`[CODE]` `src/lib/supabase.ts:11-12` : l'application démarre en mode réel, avec la session
Supabase du compte.

Déroulé imposé :
1. L'agent ouvre l'URL d'accès.
2. S'il n'est pas authentifié, il affiche exactement `⏸ ATTENTE CONNEXION MANUELLE — {url}` et attend.
3. Je me connecte moi-même, puis je réponds `GO`.
4. L'agent vérifie que la session est bien active, puis déroule sans plus jamais s'arrêter.
5. Si la session expire en cours de route : même signal, même reprise après `GO`. Aucune tentative de reconnexion automatique.

**Pendant cette même pause**, si le mode connecté est retenu (§4), c'est le moment où je
renseigne l'URL de l'orchestrateur et la clé API dans l'écran de réglages. L'agent ne le
fait jamais lui-même.

---

## 4. PÉRIMÈTRE DE LA CAMPAGNE

```
MODE                   : À RENSEIGNER        # CONSTAT (diagnostic seul) | CORRECTION (diagnostic + correctifs P0/P1)
ORCHESTRATEUR          : À RENSEIGNER        # LOCAL (SPA seule) | CONNECTÉ (orchestrateur lancé + clé posée par Laurent)
ESPACE ADMIN           : OUI                 # pas d'espace séparé : vues `members` et `api-keys`, réservées aux rôles admin
RÔLES À COUVRIR        : le rôle réel du compte de Laurent dans son workspace, tel quel
ROUTES EXCLUES         : aucune
DURÉE MAX PAR ACTION   : 60 s                # attente d'une génération avant de conclure au blocage
```

**Rôles** `[CODE]` `src/auth/permissions.ts:55-75` : quatre rôles — `owner`, `admin`,
`member`, `viewer`. `isAdminRole` = `owner` ou `admin`. La source de vérité des droits est
`orchestrator/src/api/scopes.ts` (`scopesForRole`), et `permissions.ts` s'y aligne `[CODE]`
`src/auth/permissions.ts:4` : un désaccord entre les deux est un constat P1.
L'agent ne change **pas** de rôle et n'en attribue aucun : modifier une appartenance touche
une donnée préexistante (§5). Il teste avec le rôle dont dispose le compte, constate ce qui
est masqué ou refusé, et l'écrit.

**Vues à couvrir** `[CODE]` `src/routing/appUrl.ts:16-23`, atteintes par `?v=` :

| Vue | URL | Réservée admin |
|---|---|---|
| Organigramme (défaut) | `/` ou `/?v=orgchart` | non |
| Tableau de bord | `/?v=dashboard` | non |
| Orchestration | `/?v=orchestration` | non — mais simulée en mode `local` (§0) |
| Membres | `/?v=members` | oui `[CODE]` `src/components/views/adminGuards.ts:1-12` |
| Clés API | `/?v=api-keys` | oui `[CODE]` `adminGuards.ts:14` (`canLoadApiKeys`) |
| Réglages | `/?v=settings` | non |

**Vue « Clés API » — prudence.** `[CODE]` `adminGuards.ts:18` (`mayReplaceUncopiedKey`) :
l'écran sait remplacer une clé. **Régénérer ou révoquer une clé existante casse une
intégration en service** et relève de §5 (modification d'une donnée préexistante) :
`NON TESTÉ — ACTION INTERDITE`. Afficher la liste et lire l'écran est autorisé ; ne recopier
aucune valeur de clé dans le fichier d'état, le rapport ou une capture.

**Générations attendues** `[CODE]` `src/services/` : `exportPdf.ts` et `csvService.ts`
(+ `importService.ts` pour l'import). Ce sont les générations à vérifier réellement —
fichier produit, non vide, ouvrable, conforme. Un PDF blanc ou un CSV de 0 octet est un `CASSÉ`.

---

## 5. INTERDICTIONS — COMPTE RÉEL

Non négociables, quelle que soit la configuration ci-dessus :

- Supprimer, archiver ou modifier une donnée **préexistante**, c'est-à-dire non créée par l'agent pendant la session.
- Tout paiement, achat, abonnement, saisie de moyen de paiement.
- Envoi d'e-mail, SMS ou notification vers un destinataire autre que `ceglialaurent@gmail.com`.
- Publication de contenu visible publiquement.
- Modification des paramètres de compte, de l'e-mail, du mot de passe ; suppression du compte.
- Saisie d'un mot de passe, d'une clé d'API ou d'une donnée bancaire dans un champ.
- Écriture, déplacement ou suppression dans la racine de la base de connaissance.

### Précisions propres à cette application

- **Clés API** (`?v=api-keys`) : lecture seule. Aucune création, aucune régénération, aucune
  révocation. Aucune valeur de clé recopiée où que ce soit, capture comprise.
- **Membres** (`?v=members`) : aucune invitation, aucun changement de rôle, aucun retrait.
  `canAdminManageMember` `[CODE]` `adminGuards.ts:1-12` autorise l'interface à le faire —
  l'agent, non.
- **Nœuds et agents préexistants de l'organigramme** : consultables, jamais modifiés,
  jamais déplacés. L'agent travaille sur **ses propres** nœuds `[TEST]`.
- **Transitions de statut en mode connecté** : elles écrivent l'état métier officiel et
  peuvent émettre sur le bus Synapse. N'agir que sur les objets `[TEST]` créés pendant la
  session.

Face à l'une de ces actions : aller jusqu'à l'écran précédent, décrire ce qu'on y voit,
marquer `NON TESTÉ — ACTION INTERDITE`, continuer.

---

## 6. CONVENTION DE DONNÉES DE TEST

```
PRÉFIXE                : [TEST]
FORMAT                 : [TEST] {entité} {AAAA-MM-JJ}-{NN}
E-MAIL UTILISÉ         : ceglialaurent@gmail.com
FICHIERS TÉLÉVERSÉS    : générés localement dans _e2e/fixtures/
```

Tout objet créé est reporté dans la section `À NETTOYER` du fichier d'état, avec son
emplacement, pour que je fasse le ménage moi-même. Sur cette application, préciser en plus
si l'objet a été créé en mode `local` (localStorage, effacé en vidant le navigateur) ou en
mode connecté (persisté côté Postgres/Supabase, à supprimer réellement).

---

## 7. ÉTIQUETAGE DES SOURCES

Toute affirmation produite par l'agent porte l'une de ces étiquettes :

| Étiquette | Signification |
|---|---|
| `[KB]` | Provient de la base de connaissance, avec nom de fichier |
| `[CODE]` | Vérifié dans le code source, avec `fichier:ligne` |
| `[E2E]` | Constaté à l'écran pendant le test, avec capture |
| `[À CONFIRMER]` | Hypothèse ou déduction non vérifiée |

Une affirmation sans étiquette est une erreur de méthode.
