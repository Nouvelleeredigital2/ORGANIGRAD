# État d’intégration du réseau Synapse

## Dépôts détectés sur l’ordinateur

| Programme | État du code local | Intégration possible maintenant |
|---|---|---|
| Organigrad | Dépôt Git complet avec frontend, orchestrateur et migrations Supabase | Oui — Identity Core, projets indépendants et événements Synapse sont intégrés |
| Socialize EA | Copie partielle ; plusieurs services, types et composants importés sont absents | Non sans récupérer le dépôt complet |
| Vector Studio Pro | Copie partielle sans historique Git exploitable ; plusieurs composants importés manquent | Non sans récupérer le dépôt complet |

## Ce qui est intégré dans Organigrad

- vue Identity Core ;
- identité de société et de marque versionnée ;
- création de projets indépendants ;
- sélection de l’application propriétaire ;
- sélection des applications participantes ;
- stockage séparé par workspace ;
- publication best-effort vers NED IA Synapse ;
- builders backend pour `project.created`, `project.identity_attached` et `identity.version_published` ;
- contrat documentaire références-only.

## Règle pour les autres applications

Une application complète devra implémenter :

1. la lecture du `workspaceId` ;
2. la création de son propre `projectId` ;
3. la sélection d’un `identityId` et d’une `identityVersion` ;
4. l’émission de `project.created` ;
5. l’écoute de `identity.version_published` ;
6. le refus des versions inconnues ou périmées ;
7. la conservation de ses propres données riches.

Il ne faut pas intégrer ces règles dans les copies partielles de Socialize EA ou Vector Studio tant que leurs sources complètes ne sont pas disponibles : cela créerait une divergence impossible à maintenir.

