# Produit — Organigrad

## Finalité

Organigrad est la couche d’organisation et de gouvernance du travail hybride du réseau APPS-2026. Il décrit qui intervient, dans quel ordre, avec quels droits, sur quel projet, et qui peut prendre la décision finale.

Le dépôt contient deux produits livrables :

- une SPA de consultation, d’administration et de pilotage ;
- un orchestrateur qui exécute les transitions, expose REST/MCP/SSE et persiste les états.

## Utilisateurs et rôles

- `viewer` : consultation.
- `member` : édition courante, exécution et décisions autorisées.
- `admin` : gestion étendue des membres, clés, bots et circuits.
- `owner` : autorité complète sur le workspace.
- services/agents : clés API techniques limitées par scopes et sans autorité humaine implicite.

## Capacités métier observées

1. Organigramme RH : fiches agents, pôles, hiérarchie, recherche, statistiques, import CSV/XLSX, export CSV/PDF.
2. Graphe hybride : nœuds humains, agents IA et logiciels MCP, édition et visualisation.
3. Orchestration : lancement de nœuds ou chaînes, machine à états, journal, SSE et validation humaine.
4. Workspaces : membres, invitations, rôles et clés API.
5. Bots Hermès : fiches structurées, compilation de prompt, empreinte SHA-256, activation contrôlée et bundle d’export.
6. Projets : projets, tâches, responsables, échéances, archivage et URLs qualifiées, sous feature flag.
7. Circuits : définitions versionnées, exécutions, décisions, pause/reprise/annulation, planification et rattrapage.
8. Intégrations : LINK, Synapse, MCP, Orvion, Engine, Slack, email Resend et passerelle voix.

## Contraintes métier structurantes

- Le workspace est la frontière de sécurité et de données.
- Une clé technique ne peut pas se substituer à une décision humaine.
- Les transitions illégales sont refusées.
- Les doubles commandes doivent être idempotentes.
- Les circuits et projets peuvent être présents dans le code mais désactivés dans un environnement.
- Organigrad conserve les définitions, états et références ; les applications spécialisées restent propriétaires de leurs artefacts.
- Le mode local sert au brouillon et aux tests. Il ne prouve ni sécurité multi-utilisateur ni persistance distante.

## Hors périmètre observé

- Aucun paiement.
- Aucun pipeline RAG, embedding ou base vectorielle.
- Aucun stockage documentaire ou média propriétaire ; les circuits conservent des références d’artefacts.

