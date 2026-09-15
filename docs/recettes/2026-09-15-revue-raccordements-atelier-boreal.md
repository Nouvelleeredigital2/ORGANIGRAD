# Revue locale — raccordements Atelier Boréal

Date : 15 septembre 2026. Périmètre : préparation locale uniquement. Aucun déploiement, aucune migration appliquée, aucune fusion.

## Décision d’intégration

Aucune des quatre branches n'est fusionnable pour le parcours Atelier Boréal à cette étape.

| Raccordement | État de revue | Décision | Preuve / écart |
| --- | --- | --- | --- |
| Orvion #107 | Contrat lu, tests non exécutables dans le worktree | Bloqué | `brief:create` retourne un artefact `brief`, alors que l'étape `visual_brief` d'OrganiGrad exige un `visual_prompt`. Il faut un contrat qui retourne les deux références, ou une opération versionnée dédiée au prompt. |
| Synapse #44 | Contrat lu ; 18 tests d’identité passent ; test SQL non exécutable | En attente de qualification SQL | Le test requiert `@electric-sql/pglite`, absent du worktree. Le raccordement signé ne doit pas être fusionné sans ce test. |
| LINK #53 | 27 tests unitaires passent | En attente de la réception de circuit | LINK signe et relaie correctement. La route OrganiGrad cible aujourd'hui une validation de nœud, pas une décision de `CircuitExecution`. |
| OrganiGrad #31 | Contrat lu ; test SQL non exécutable | Bloqué pour Boréal | `/api/link-bridge/nodes/:nodeId/decision` appelle `decideNode`; il faut une route de décision de circuit qui vérifie la même assertion puis appelle `PgCircuitStore.decide`. |

## Travail intégré localement dans OrganiGrad

- `PgCircuitReceipts` appelle uniquement les RPC `circuit_receipt_reserve`, `circuit_receipt_accept` et `circuit_receipt_mark_uncertain`.
- `PgBorealExecutor` réserve le reçu avant l'appel externe, accepte une référence vérifiée avant la transition de circuit et rend `waiting_engine` sans image fictive.
- `PgCircuitStore.completeExternal` et `waitForEngine` persistent les transitions internes sous verrou de l'exécution.

Les tests ciblés couvrent la réservation avant appel, la réponse perdue, la reprise d'un reçu accepté, l'indisponibilité d'Engine et la version d'exécution obsolète.

## Correctifs nécessaires avant la recette connectée

1. Orvion : aligner le résultat de la production de brief avec `visual_prompt`, tout en préservant une référence `brief` versionnée.
2. OrganiGrad #31 : ajouter la réception signée des décisions de circuit. La route doit contrôler la signature Synapse, le `ProjectRef`, l'appartenance au workspace, l'assignation de l'étape et la clé d'idempotence ; elle ne doit pas recevoir l'acteur du navigateur.
3. Réinstaller les dépendances de test dans les worktrees Orvion, Synapse et OrganiGrad de revue, puis exécuter leurs suites SQL.
4. Une fois les trois écarts levés, composer la recette locale avec les adaptateurs simulés et le même `ProjectRef`.
## Interfaces

OrganiGrad contient déjà la carte de dossier : étape active, état `En attente d’Engine`, références versionnées et actions de validation réservées à l’humain. Elle reste alimentée par l’état de l’orchestrateur.

LINK ne contient pas encore les cartes de sujets, correction et validation propres à une exécution de circuit. La branche #53 couvre le pont d’identité, pas cette interface de dossier. Cet écart empêche de déclarer la recette connectée utilisable dans LINK.
