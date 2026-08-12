# Contrat de contexte projet — APPS-2026

Les applications du réseau peuvent créer leurs projets indépendamment. Elles utilisent les événements Synapse pour publier les références de contexte, jamais les données riches.

## Événements

### `project.created`

Publié par l’application qui crée le projet.

```json
{
  "type": "project.created",
  "sourceApp": "vector-studio",
  "workspaceId": "ws_123",
  "projectId": "project_456",
  "payload": {
    "ownerApp": "vector-studio",
    "identityId": "identity_789",
    "identityVersion": 3,
    "participatingApps": ["identity-core", "ned-ia-synapse"],
    "dataPolicy": "references-only"
  }
}
```

### `project.identity_attached`

Publié par Identity Core lorsqu’une identité est rattachée à un projet.

### `identity.version_published`

Publié par Identity Core lorsqu’une nouvelle version officielle devient disponible.

## Règles de sécurité

- `workspaceId` et `projectId` sont obligatoires pour les projets ;
- `identityVersion` est obligatoire lorsqu’une identité est attachée ;
- les applications ne reçoivent pas automatiquement la charte complète ;
- les fichiers, contenus et données riches restent dans leur application propriétaire ;
- les consommateurs doivent refuser une version d’identité inconnue ou périmée ;
- `dataPolicy: references-only` est obligatoire pour ces événements.

