# Équipes et circuits partagés — suivi d'exécution

Plan utilisateur accepté le 11 septembre 2026. OrganiGrad possède les identités,
équipes, circuits et états ; LINK et Telegram portent conversations et décisions ;
Synapse transporte des références ; Orvion conserve les dossiers versionnés ;
Engine produit les images. Publication externe reportée. Validation humaine par
défaut, exception bot explicite par administrateur. Projet partagé obligatoire.

## Registre des lots

| Lot | Développé | Tests locaux | Déployé | Recette réelle |
|---|---|---|---|---|
| 0 — Rapprochement projets et infrastructure | En cours | — | Non | Non |
| 1 — Membres, portraits, connexions | En cours | En cours | Non | Non |
| 2 — Dossiers Orvion par projet | Partiel : API, SQL, lecture UI | SQL et API passants | Non | Non |
| 3 — Circuits et exécutions persistantes | En cours | En cours | Non | Non |
| 4 — LINK et Telegram équivalents | Partiel : rattachement conversation LINK | SQL, API, UI passants | Non | Non |
| 5 — Registre dynamique, génération et Engine | Partiel : adaptateur Engine isolé | 17 tests adaptateur passants | Non | Non |
| 6 — Recette et bascule | Non | Non | Non | Non |

## Sources consolidées

- Organigrad : worktree equipes-circuits-20260911, base master bb31375 incluant
  les projets (#23) et Bots (#24). Backend initial : 538 tests réussis, 63 ignorés.
- Contrats : worktree contracts-equipes-20260911 issu du pilote df98ce6
  (1.6.0-pilot.4), qui contient ProjectRef et les assertions de liaison personnelle.
  Les tarballs plus anciens des consommateurs ne sont pas supposés équivalents.
- Les checkouts racine des applications ont des modifications d'autres sessions ;
  elles ne sont ni déplacées ni incluses dans ce chantier.
- Le dernier contrôle distant d'Organigrad refusait get_project_url pour
  xucmfdggetwxmpquqjvj. Requalifier avant migration ; aucun SQL antérieur rejoué.
- Le parcours projets personnel reste limité à la lecture. Il ne constitue pas
  une autorisation d'exécution programmée.

## Avancement local du 11 septembre

- Contrats `1.6.0-teams.1` : circuits, programmation, références de livrables,
  décisions versionnées et sélection du sujet, réunis avec ScopeContext et le
  registre de dossiers existant. 201 tests passent. Tarball distribué aux
  worktrees OrganiGrad, LINK et Synapse. PR contrats :
  https://github.com/Nouvelleeredigital2/apps2026-contracts/pull/10 (brouillon).
- OrganiGrad : portrait HTTPS, création atomique fiche/nœud, synchronisation
  d'identité, brouillon imposé pour les nouveaux bots, contrat conversationnel
  sans valideur personnel imposé. Relecture portraits et Engine effectuée.
- Circuits : éditeur visuel distinct, projets/membres réels, définitions
  versionnées et snapshots d'exécutions, décisions isolées par dossier, reprise
  ciblée, pause/reprise/annulation. Les commandes ne déclenchent aucun LLM pour
  l'instant. Module API fermé par défaut via `CIRCUITS_ENABLED`.
- Vue Dossiers : productions et historique réels de l'API, choix du sujet,
  correction et approbation par l'humain assigné ; commandes versionnées et
  clés conservées après une réponse réseau perdue. Pas de lancement proposé
  par l'interface tant que l'exécuteur de production manque.
- Tentatives Engine persistantes : réservation exclusive, enregistrement avant
  envoi, état incertain sans renvoi automatique après panne. Adaptateur et
  stockage testés isolément ; aucun appel réel Engine effectué.
- Planificateur SQL préparé : curseur verrouillé, occurrence unique, grant
  projet révocable, retard enregistré sans rattrapage automatique. Non branché
  dans bootstrap ; interface d'autorisation et activation encore à construire.
- Orvion worktree : API `/api/editorial/boards/:boardId`, binding immuable,
  dossiers idempotents et versions append-only, vue de lecture. 10 tests
  SQL/HTTP après corrections de revue. Authentification humaine seulement.
- LINK worktree : association explicite d'une conversation au ProjectRef lu
  via la liaison personnelle existante. La RPC impose membership actuel et
  conversation autorisée. Aucun droit de service déduit de cette association.
- Synapse : reprise du chantier dossiers à 68e7d07, préservant le pilote privé
  49d78dd. Les routes personnelles restent montées lorsque les scopes sont
  actifs, avec leurs propres contrôles ; les routes historiques non isolées
  restent fermées. Cette base n'est pas encore intégrée à origin/main.

### Vérifications exécutées

| Composant | Résultat local | Limite |
|---|---|---|
| Contrats | 201 tests, typecheck, build | Paquet pilote vendored |
| OrganiGrad | 451 tests interface ; 595 backend, 63 ignorés ; 20 Python | Aucun parcours distant |
| LINK | 890 tests, 18 ignorés ; 102 tests de compatibilité après mise à jour du contrat ; 5 tests de route après ajout du contrôle Origin | Un premier passage concurrent avait deux timeouts, absents à la relance avec deux workers |
| Orvion | 241 tests backend ; 10 tests SQL/HTTP éditoriaux et test UI ciblé | Deux échecs client préexistants de mocks boardsService ; lint global préexistant en échec |
| Synapse | 449 tests backend et 334 frontend, typechecks | Fonctionnalités non activées à distance |

Les captures `evidence-circuits-20260911` proviennent du composant éditeur avec
des fixtures explicitement étiquetées, réseau distant bloqué. Affichage bureau
et mobile, focus clavier et enregistrement local vérifiés. Elles ne constituent
pas une recette interapplications.

### Ce qui manque avant la recette

1. Création complète des membres et équipes, compte humain associé, portrait
   téléversé, vérification et activation des bots, secret Telegram chiffré.
2. Association explicite ProjectRef / ScopeContext existant (leurs identifiants
   de projet et workspace ne sont pas interchangeables), autorisations de
   service par projet entre les applications, projection des
   identités dans LINK et runtime dynamique utilisant le registre OrganiGrad.
3. Raccordement Orvion en service, création du dossier depuis l'exécution,
   invalidation des validations après une nouvelle version externe.
4. Exécuteur de production LLM, contrôles qualité et rattachement Engine.
5. Commandes LINK/Telegram, identités vérifiées, groupes privés, décisions
   simultanées et reçus réseau perdus. Ne pas envoyer un JWT LINK à OrganiGrad.
6. Worker unique activé, rattrapage explicite des horaires manqués, aperçu des
   prochaines occurrences dans l'interface ; concurrence sur PostgreSQL connecté.
7. Qualification des accès, migrations manquantes uniquement, déploiements,
   recette réelle et bascule des 14 historiques sans doubles programmations.

Le refus Supabase OrganiGrad bloque les opérations distantes concernées.
L'implémentation locale reste possible. Aucun de ces sous-lots n'est une
livraison de bout en bout ; les 14 bots ne sont pas notés 10/10 par ces tests.

## Critères de clôture (inchangés)

Créer un nouveau bot et retrouver son identité dans LINK ; isoler deux projets ;
programmer une veille sans doublon ; décider depuis les deux canaux ; conserver
les versions dans Orvion ; produire une image Engine ; corriger puis valider le
dossier. Conserver preuves de reprise, révocation et indisponibilité. « Validé —
prêt à publier » n'est jamais « publié ». Aucun lot n'est déclaré terminé sur la
seule présence de code ou d'un conteneur.
