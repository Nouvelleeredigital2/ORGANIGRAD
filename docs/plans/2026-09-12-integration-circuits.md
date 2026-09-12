# Intégration des circuits et de la présence

## Source et coordination

Branche `integrate/equipes-presence-20260912`, fusion `1f5a59a` : conserve le
chantier circuits `efc5172` et la présence ajoutée jusqu'à `fd2b7b4` dans la branche
récente. Les checkouts d'origine restent intacts. Claude conserve les opérations
Supabase ; aucune migration appliquée ni modifiée dans cette reprise.

Le merge récupère la migration existante `20260912100000_hybrid_nodes_presence.sql`.
La comparer au rapport de Claude avant déploiement, sans rejouer une migration
déjà appliquée. Les six migrations circuits/bots ne sont pas remplacées par elle.

## Implémenté

- Contrats frontend/backend alignés sur `1.6.0-teams.3` consommé par Synapse/LINK.
- `dispatchEngineStep` connecte le client Engine au registre persistant des
  tentatives. Vérification d'autorisation avant lecture et après réservation,
  empreinte du moteur/prompt, marquage avant POST, reçu persisté avant succès.
- Reprise d'un job connu sans nouvel envoi. Une tentative dispatched/uncertain
  ne déclenche jamais de nouveau POST après redémarrage. Une erreur de stockage
  ne se transforme pas en absence de tentative. Si le reçu ne peut être stocké,
  l'erreur interne conserve le jobId pour réconciliation contrôlée.

Le dispatcher est un module interne testé : pas encore branché au bootstrap.
Son appelant devra vérifier l'autorisation du projet et l'affectation de l'étape.
Il ne crée pas de grant, de dossier Orvion, de fournisseur ou de génération réelle.
La programmation et les décisions multi-canaux restent à raccorder.

## Preuves locales

- Frontend : 471 tests passants ; build réussi.
- Orchestrateur : 605 passants, 63 ignorés ; typecheck/build réussis.
- Engine : 30 tests ciblés passants, dont 7 nouveaux tests du dispatcher.
- Aucun secret ou accès Supabase utilisé pour ces tests ; aucun déploiement.

## Suites du plan

1. Réceptionner le rapport Claude, qualifier l'API d'identités et les affectations.
2. Raccorder la projection LINK et les autorisations métier par projet.
3. Ajouter l'accès de service Orvion et la fraîcheur des versions à l'approbation.
4. Brancher exécuteur LLM/Engine, worker et décisions LINK/Telegram.
5. Recette manuelle, programmation pilote, puis bascule des anciennes veilles.

La livraison globale n'est pas terminée ; aucune qualité persona 10/10 établie.
