# Base de connaissance — OrganiGrad

> **État documentaire : 13 septembre 2026**  
> Cette page décrit la finalité d'OrganiGrad, ses fonctions, son architecture et
> son rôle dans le réseau Synapse. Elle distingue volontairement la cible
> fonctionnelle, le code disponible et les parcours réellement vérifiés en
> production.

## 1. Définition

**OrganiGrad est le système d'organisation et de gouvernance du travail hybride
du réseau APPS-2026.**

L'application ne se limite plus à afficher un organigramme RH. Elle permet
d'organiser, dans un même espace :

- les personnes ;
- les agents IA et les bots Hermès ;
- les logiciels accessibles par MCP ;
- les projets et leurs tâches ;
- les circuits de production ;
- les responsabilités de chaque étape ;
- les validations humaines ;
- l'état officiel et l'historique des exécutions.

En une phrase :

> **OrganiGrad définit qui intervient, dans quel ordre, avec quels droits, sur
> quel projet, et qui prend la décision finale.**

---

# Partie I — À quoi sert OrganiGrad ?

## 2. Le problème auquel l'application répond

Dans une organisation composée d'humains, d'agents IA et de logiciels
spécialisés, un simple outil de tâches ne suffit pas. Il faut notamment savoir :

- qui est responsable d'une mission ;
- quel agent peut exécuter quelle étape ;
- quel logiciel doit produire ou vérifier un livrable ;
- à quel projet les actions appartiennent ;
- quand une validation humaine est obligatoire ;
- quelle version d'un résultat a été approuvée ;
- où reprendre un travail interrompu ;
- si une exécution est en attente, en erreur, en pause ou terminée ;
- quelles actions ont réellement été effectuées.

OrganiGrad fournit cette couche de coordination et de gouvernance.

Il ne remplace pas les applications spécialisées :

- Atelier Orvion reste propriétaire des articles et dossiers éditoriaux ;
- NED Media Engine reste propriétaire des générations de médias ;
- LINK reste l'interface conversationnelle ;
- Mémoire Vive reste propriétaire de la mémoire autorisée ;
- Synapse transporte les références, les autorisations et les événements ;
- chaque autre application métier conserve ses propres objets.

OrganiGrad conserve, lui, **la définition du circuit et son état officiel**.

## 3. Les trois dimensions fonctionnelles

### 3.1 L'organigramme humain

C'est la fonction historique de l'application. Elle permet de gérer des fiches
contenant notamment :

- nom et prénom ;
- fonction et titre ;
- service et pôle ;
- responsable de rattachement ;
- grade ou niveau ;
- type de temps de travail ;
- NBI ;
- coordonnées ;
- avatar.

Les fiches sont regroupées par pôle et transformées en arbre hiérarchique.
L'utilisateur peut :

- parcourir les différents pôles ;
- rechercher une personne ;
- localiser sa place dans la hiérarchie ;
- consulter sa fiche et ses coordonnées ;
- modifier les fiches s'il possède les droits nécessaires ;
- importer un organigramme ;
- exporter les données en CSV ;
- produire un organigramme PDF A3, pôle par pôle ou par lot.

Le tableau de bord fournit notamment le nombre d'agents, leur répartition par
pôle et des statistiques comme la moyenne de NBI.

Le modèle RH historique est défini dans
[`src/types/agent.ts`](../src/types/agent.ts).

### 3.2 L'organigramme hybride

OrganiGrad étend l'organigramme aux acteurs non humains. Chaque élément devient
un **nœud hybride** appartenant à l'une de ces catégories :

| Type | Fonction |
|---|---|
| `HUMAN` | Responsable, garant ou valideur humain |
| `AGENT_IA` | Agent chargé de créer, analyser, superviser ou proposer |
| `SOFTWARE_MCP` | Logiciel ou service technique appelé par MCP |

Un nœud contient notamment :

- une identité et un rôle ;
- une place dans le graphe ;
- des compétences déclarées ;
- éventuellement un prompt système ;
- éventuellement une configuration MCP ;
- des canaux de notification ;
- un état d'exécution.

La vue **Orchestration** permet de visualiser la chaîne Humain · IA · MCP, de
créer et modifier les nœuds, de lancer un agent ou un logiciel, de suivre les
états et de traiter les validations humaines.

Le modèle se trouve dans
[`src/types/hybridNode.ts`](../src/types/hybridNode.ts).

### 3.3 Les circuits de travail

Le troisième niveau est métier : un **circuit** décrit la façon dont un projet
doit avancer. Il est rattaché à un projet réel et contient une suite ordonnée
d'étapes.

Un circuit éditorial peut par exemple comprendre :

1. une veille sourcée ;
2. le choix du sujet ;
3. la rédaction ;
4. le brief visuel ;
5. la génération du visuel ;
6. le contrôle ;
7. la validation finale.

Pour chaque étape, OrganiGrad enregistre :

- sa fonction ;
- son responsable ;
- ses consignes ;
- le type de validation ;
- l'étape à reprendre si une correction est demandée.

Le responsable peut être un humain ou un exécutant enregistré. Pour certaines
validations, un bot peut être désigné explicitement par un administrateur. Cette
désignation reste limitée au circuit concerné : elle ne transforme pas tous les
bots en décideurs généraux.

## 4. Projets et tâches

OrganiGrad dispose d'une gestion persistante des projets. Un projet peut
contenir :

- un nom et une description ;
- des tâches ;
- un responsable de tâche ;
- une échéance ;
- un statut `à faire`, `en cours`, `bloqué` ou `terminé` ;
- un état actif ou archivé.

Les projets et tâches sont isolés par espace de travail. Une URL peut pointer
directement vers un projet, mais l'application vérifie que l'utilisateur
appartient bien à l'espace correspondant.

Selon son rôle, l'utilisateur peut consulter, créer, modifier, attribuer,
archiver ou restaurer les projets et les tâches.

> Le module Projets est contrôlé par des indicateurs d'activation coordonnés
> entre le frontend, l'orchestrateur et la base de données. Sa présence dans le
> code ne signifie donc pas qu'il est actif dans tous les environnements.

## 5. Registre des bots Hermès

La vue **Bots** constitue le registre des personas IA utilisés par Hermès.

Chaque bot dispose d'une fiche structurée avec notamment :

- un nom d'affichage ;
- une identité technique stable ;
- une famille fonctionnelle ;
- une mission ;
- une personnalité ;
- des règles de recherche et de veille ;
- les livrables attendus ;
- une méthode de travail ;
- des limites ;
- des sources autorisées ;
- un modèle et ses paramètres ;
- un éventuel compte Telegram ;
- un état `Brouillon` ou `Activé`.

À partir de cette fiche, l'orchestrateur compile un prompt système et calcule
son empreinte SHA-256.

La séparation des responsabilités est importante :

- OrganiGrad est la source de vérité de la fiche structurée ;
- Hermès utilise ensuite un paquet de synchronisation ;
- modifier une fiche dans OrganiGrad ne signifie pas qu'Hermès exécute déjà la
  nouvelle version ;
- le prompt ne doit pas être dupliqué entre plusieurs systèmes divergents.

Un bot peut également être représenté comme un nœud `AGENT_IA` dans la vue
Orchestration.

## 6. Exécution d'un circuit

Lorsqu'un circuit est démarré, OrganiGrad crée un **dossier d'exécution
persistant**.

Un dossier possède :

- la version exacte du circuit utilisée ;
- l'étape courante ;
- un statut ;
- une révision ;
- les références des livrables ;
- l'historique des décisions ;
- les retours de correction.

Ses principaux états sont :

| État | Signification |
|---|---|
| `ready` | Une étape est prête à être exécutée |
| `waiting_approval` | Une décision du responsable est attendue |
| `paused` | Le dossier est volontairement suspendu |
| `blocked` | L'exécution ne peut pas continuer |
| `cancelled` | Le dossier a été annulé |
| `ready_to_publish` | La version finale a été validée |

Un administrateur peut mettre un dossier en pause, le reprendre ou l'annuler.

Une personne ne peut décider que si elle est le responsable désigné de l'étape.
La décision porte sur une étape, une révision du dossier et, si nécessaire, un
artefact et sa version.

Les commandes possèdent des clés d'idempotence : une réponse réseau perdue ou
un double clic ne doit pas produire deux décisions ou deux exécutions.

## 7. Démarrage manuel et programmation

### 7.1 Démarrage manuel

Un membre autorisé peut cliquer sur **Démarrer un dossier**. Cela crée
l'exécution persistante à la première étape.

Le démarrage manuel :

- ne produit pas automatiquement un article ;
- ne fabrique pas un livrable fictif ;
- n'active pas une programmation ;
- ne publie rien.

### 7.2 Programmation

Un circuit peut recevoir un rendez-vous hebdomadaire avec un jour, une heure et
un fuseau horaire. L'interface peut afficher un aperçu des prochaines
occurrences.

La programmation nécessite une autorisation de service spécifique, temporaire
et révocable. Cette autorisation ne suffit pas à elle seule : le circuit,
l'exécuteur et le worker doivent également être activés.

Si une occurrence est manquée, elle reste enregistrée. Un administrateur peut
la rattraper en utilisant la version du circuit qui était prévue à cette date.

## 8. Machine à états et validation humaine

Pour les nœuds hybrides, les changements de statut suivent une machine à états
stricte :

```text
IDLE
  → EXECUTING
      → CONTROL_PENDING_IA
      → WAITING_HUMAN_APPROVAL
      → ERROR

CONTROL_PENDING_IA
  → WAITING_HUMAN_APPROVAL
  → ERROR

WAITING_HUMAN_APPROVAL
  → IDLE  si approbation
  → ERROR si rejet

ERROR
  → IDLE après correction et réinitialisation
```

Toute transition non prévue est refusée.

Les principes essentiels sont :

- un agent ne peut pas inventer une validation humaine ;
- une attente humaine ne peut être levée que par une action autorisée ;
- une erreur d'exécution arrête la chaîne ;
- les écritures sont persistées avant de confirmer le succès ;
- les transitions sont journalisées ;
- les doubles exécutions concurrentes sont bloquées.

La machine à états se trouve dans
[`orchestrator/src/domain/stateMachine.ts`](../orchestrator/src/domain/stateMachine.ts).

## 9. Utilisateurs, espaces et autorisations

OrganiGrad est multiespace. Les données sont cloisonnées par `workspace`.

Les rôles humains sont :

| Rôle | Capacités générales |
|---|---|
| `viewer` | Consultation |
| `member` | Consultation, édition courante, exécution et décision autorisée |
| `admin` | Gestion étendue, membres, clés et circuits |
| `owner` | Autorité complète sur l'espace |

L'application distingue deux formes d'identité :

1. la session humaine Supabase, utilisée pour les actions personnelles et les
   décisions ;
2. la clé API technique, utilisée par les agents et services.

Une clé technique est limitée par des scopes. Elle ne reçoit pas
automatiquement les droits humains ou administratifs. Masquer un bouton dans
l'interface améliore l'expérience, mais la véritable protection reste appliquée
par l'orchestrateur et les politiques PostgreSQL/RLS.

Le modèle de permissions est résumé dans
[`src/auth/permissions.ts`](../src/auth/permissions.ts).

## 10. Import, export et sources de données

L'application sait charger des données depuis :

- un fichier CSV local ;
- un fichier Excel `.xlsx` ou `.xls` ;
- une URL de fichier CSV distant ;
- la base Supabase en mode connecté.

L'import s'effectue en deux temps : prévisualisation, puis confirmation. Il
identifie les lignes invalides et les doublons, puis permet une fusion ou un
remplacement selon le choix de l'utilisateur.

Les fichiers CSV et Excel sont des moyens d'import ou d'export. Ils ne sont pas
la source de vérité en mode connecté.

## 11. Architecture technique

OrganiGrad est composé de trois couches principales :

```text
Interface React
    │
    ├── session humaine ──→ Supabase
    │                       Auth + PostgreSQL + RLS
    │
    └── API authentifiée ─→ Orchestrateur Node/Fastify
                              │
                              ├── machine à états
                              ├── circuits persistants
                              ├── client et serveur MCP
                              ├── notifications
                              └── connexion Synapse
```

### 11.1 Supabase/PostgreSQL

La base est la source de vérité persistante pour :

- les workspaces et membres ;
- les fiches RH ;
- les nœuds hybrides ;
- les projets et tâches ;
- les bots ;
- les circuits et exécutions ;
- les transitions ;
- les notifications et journaux.

### 11.2 L'orchestrateur

L'orchestrateur applique les règles d'exécution :

- contrôle des autorisations ;
- transitions d'état ;
- appels MCP ;
- exécution et reprise ;
- validation humaine ;
- notifications ;
- échanges avec Synapse.

### 11.3 Le frontend

Le frontend présente et pilote les fonctions, mais n'est pas la source de
vérité. Ses caches servent uniquement de repli temporaire. Un cache obsolète
doit être signalé comme tel.

L'architecture des données est détaillée dans
[`docs/architecture/data-flow.md`](architecture/data-flow.md).

---

# Partie II — Le rôle d'OrganiGrad dans le réseau Synapse

## 12. Sa position dans le réseau

Dans Synapse, OrganiGrad joue le rôle de **plan de contrôle organisationnel**.

| Composant | Responsabilité |
|---|---|
| **OrganiGrad** | Organiser les membres et circuits, démarrer et suivre les exécutions, enregistrer les décisions officielles |
| **LINK** | Fournir l'interface conversationnelle et présenter les demandes, livrables et décisions |
| **Synapse** | Relier les identités, projets, références et autorisations ; transporter et tracer les événements |
| **Hermès** | Exécuter les missions confiées dans les limites de ses droits |
| **Applications spécialisées** | Créer et conserver leurs propres objets métier |
| **Mémoire Vive** | Archiver la mémoire et les décisions autorisées |

Le principe central est :

> **LINK peut présenter une décision et Synapse peut la transporter, mais
> OrganiGrad reste l'autorité qui la vérifie et l'enregistre dans le circuit.**

## 13. OrganiGrad comme producteur d'événements

Lorsqu'un workflow atteint une étape humaine, OrganiGrad peut émettre sur
Synapse :

```text
validation.requested
```

L'événement contient notamment :

- le nœud concerné ;
- un identifiant de validation ;
- un titre compréhensible ;
- l'application source ;
- une corrélation stable ;
- éventuellement un lien vers l'écran d'OrganiGrad.

La cible principale est LINK, afin que la demande puisse être présentée à
l'utilisateur.

Après la décision officielle, OrganiGrad émet :

```text
validation.approved
```

ou :

```text
validation.rejected
```

La demande et la réponse utilisent la même corrélation, ce qui permet de
reconstituer la chaîne complète. La décision peut être destinée à LINK pour
mettre à jour la conversation et à Mémoire Vive pour archivage.

Cette émission est **best effort** : une panne temporaire du bus ne doit pas
annuler une décision déjà enregistrée dans la base officielle d'OrganiGrad.

Le producteur est implémenté dans
[`orchestrator/src/synapse/producer.ts`](../orchestrator/src/synapse/producer.ts).

## 14. OrganiGrad comme consommateur

OrganiGrad peut également recevoir des demandes de validation provenant
d'autres applications.

Le consommateur :

1. interroge le bus Synapse ;
2. sélectionne les événements `validation.requested` ;
3. ignore les demandes émises par OrganiGrad lui-même ;
4. exige un `workspaceId` explicite ;
5. isole les demandes par workspace ;
6. les rend accessibles aux utilisateurs autorisés ;
7. réémet la décision vers Synapse.

Une demande sans workspace est ignorée : elle ne doit jamais tomber dans un
panier partagé visible par tous.

L'approbation ou le rejet nécessite les droits humains correspondants. Une clé
technique ordinaire ne peut donc pas utiliser ce chemin pour fabriquer une
décision.

Le consommateur se trouve dans
[`orchestrator/src/synapse/consumer.ts`](../orchestrator/src/synapse/consumer.ts).

## 15. Références plutôt que duplication des contenus

Synapse et OrganiGrad manipulent principalement des **références d'artefacts**.
Un dossier peut par exemple contenir une référence vers :

- une veille ;
- un sujet ;
- un article ;
- un brief ;
- une image ;
- un rapport de contrôle.

La référence indique l'application propriétaire, l'identifiant de l'objet, sa
version, son type et son URL canonique.

L'article lui-même reste dans Orvion, l'image dans Engine, etc. Cette approche
évite :

- plusieurs copies divergentes ;
- l'approbation d'une version ambiguë ;
- la transformation de Synapse en base éditable universelle ;
- l'accès indirect à des contenus sans autorisation.

Une référence dans Synapse ne donne donc pas automatiquement accès à l'objet
référencé.

## 16. Exemple de parcours dans Synapse

```text
OrganiGrad
  définit le projet, les membres et le circuit
        ↓
Hermès
  effectue la veille et propose des sujets
        ↓
Application propriétaire
  conserve les livrables et renvoie leurs références
        ↓
OrganiGrad
  place le dossier en attente de décision
        ↓
Synapse
  transporte validation.requested
        ↓
LINK
  présente les propositions à la personne désignée
        ↓
Utilisateur
  choisit, approuve ou demande une correction
        ↓
OrganiGrad
  vérifie identité + workspace + circuit + étape + version
        ↓
OrganiGrad
  enregistre la décision officielle
        ↓
Synapse
  transporte validation.approved ou validation.rejected
        ↓
Le circuit poursuit l'étape suivante ou revient à l'étape de correction
```

Si une production est corrigée, les résultats produits en aval doivent être
invalidés ou recalculés. Une ancienne validation ne vaut pas automatiquement
pour une nouvelle version.

## 17. Ce que Synapse ne doit pas faire à la place d'OrganiGrad

Synapse ne doit pas :

- devenir une seconde source de vérité du circuit ;
- modifier librement les décisions ;
- considérer une référence comme une autorisation d'accès ;
- attribuer un projet à partir d'un simple nom commun ;
- permettre à un agent de s'auto-approuver ;
- confondre une autorisation de transport avec une autorisation d'exécution ;
- stocker une copie générale et modifiable de tous les contenus métier.

OrganiGrad ne doit pas non plus se comporter comme propriétaire des objets des
autres applications. Il conserve leur référence, leur version et leur rôle dans
le circuit.

---

# Partie III — État réel connu au 13 septembre 2026

## 18. Fonctions effectivement acquises

Les preuves disponibles établissent que :

- le frontend et l'API OrganiGrad étaient déployés sur `apps2026-prod` ;
- les projets, circuits et accès associés étaient disponibles ;
- 14 personas ont été importés et persistent dans le registre ;
- ces 14 personas sont encore en **brouillon** ;
- un circuit Boréal de sept étapes a été créé ;
- un dossier persistant a été démarré manuellement ;
- la pause, le rechargement et la reprise du même dossier ont été vérifiés ;
- aucune seconde exécution n'a été créée lors du rechargement ;
- aucun faux livrable n'a été annoncé.

Le fichier [`../ETAT-RESEAU-SYNAPSE-20260913.md`](../ETAT-RESEAU-SYNAPSE-20260913.md)
renvoie vers les reçus et l'état réseau de référence.

## 19. Fonctions non encore certifiées de bout en bout

À cette date, il ne faut pas présenter comme opérationnels de bout en bout :

- l'activation des 14 nouveaux profils dans Hermès ;
- leur synchronisation automatique ;
- leur projection complète dans LINK ;
- le worker de programmation des nouveaux circuits, encore désactivé ;
- l'exécution automatique réelle de toutes les étapes ;
- la production d'un article réel dans Orvion par le circuit ;
- une génération d'image réelle par Engine ;
- la synchronisation complète des décisions LINK ou Telegram ;
- la validation finale d'un parcours complet multiapplication ;
- la publication externe.

En résumé :

> **OrganiGrad sait déjà définir et conserver un circuit, démarrer un dossier et
> enregistrer son état. Le raccordement complet des exécutants et des décisions
> multicanales reste le principal chantier.**

## 20. Point de vigilance documentaire

Le dépôt local principal et les versions livrées ne sont pas nécessairement au
même commit. Toute intervention doit distinguer :

1. la fonction imaginée ou documentée ;
2. le code présent sur une branche ou dans un worktree ;
3. le code fusionné ;
4. l'image effectivement déployée ;
5. la configuration activée ;
6. la recette réellement exécutée.

La présence d'un écran, d'une migration ou d'un événement dans le code ne suffit
pas à déclarer un parcours opérationnel en production.

---

# Résumé court réutilisable

> **OrganiGrad est l'autorité organisationnelle du réseau Synapse.** Il modélise
> les humains, agents IA et logiciels, gère les projets et les tâches, définit
> les circuits de travail, attribue les responsabilités, contrôle les
> transitions, impose les validations humaines et conserve l'état officiel des
> exécutions.
>
> Dans le réseau Synapse, OrganiGrad ne remplace ni les applications productrices
> ni l'interface LINK. Il enregistre les circuits et décisions, tandis que
> Synapse transporte les événements, références et autorisations, LINK présente
> les interactions, Hermès exécute les missions autorisées et chaque application
> spécialisée conserve ses propres objets.
>
> Au 13 septembre 2026, le registre de bots, les projets, les circuits et
> l'exécution persistante manuelle sont présents. Le pilote Boréal a démontré le
> démarrage, la pause et la reprise. L'exécution automatique complète, la
> synchronisation Hermès, les décisions LINK/Telegram et la production réelle
> multiapplication restent à raccorder et à certifier.

## Documents associés

- [README général](../README.md)
- [Architecture des données](architecture/data-flow.md)
- [Actions asynchrones](architecture/actions-asynchrones.md)
- [Documentation de l'orchestrateur](../orchestrator/README.md)
- [État du réseau Synapse au 13 septembre 2026](../ETAT-RESEAU-SYNAPSE-20260913.md)

