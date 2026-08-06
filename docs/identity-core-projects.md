# Identity Core et projets indépendants — APPS-2026

## Décision

Identity Core est la source de vérité de l’identité globale : société, marques, chartes graphiques et visuelles, logos, couleurs, typographies, ton, style, positionnement et règles de communication externe.

Les applications spécialisées restent autonomes et peuvent créer leurs propres projets. Un projet se rattache à une identité par `identityId` et `identityVersion`, mais ne copie pas l’identité complète.

```text
Identity Core possède l’identité.
Chaque application possède ses projets.
NED IA Synapse relie les deux.
Organigrad gouverne les validations.
```

## Cloisonnement

Chaque donnée est filtrée par son workspace et son contexte :

```text
workspaceId → companyId → brandId → projectId → campaignId
```

Une donnée riche possède une seule source de vérité. Les autres applications reçoivent des références, une version et les éléments autorisés dont elles ont besoin.

| Donnée | Source de vérité |
|---|---|
| Identité et charte | Identity Core |
| Clients et projets commerciaux | Neo Cortex Digital |
| Graphe et workflow | NED IA |
| Événements et audit | NED IA Synapse |
| Rôles et validations | Organigrad |
| Conversations | LINK |
| Décisions | Mémoire Vive Connect |
| Contenus métier | Application spécialisée |

## Fonctionnalité implémentée dans Organigrad

La vue **Identity Core** est disponible dans la navigation principale. Elle permet de :

- créer une identité de société et de marque ;
- renseigner positionnement, ton, style visuel et communication externe ;
- publier une identité et faire progresser sa version ;
- créer un projet indépendant ;
- choisir l’application propriétaire du projet ;
- rattacher le projet à une identité et à sa version ;
- sélectionner les applications participantes ;
- conserver les données séparées par workspace.

Le premier prototype utilise un stockage local namespacé par workspace. La prochaine étape de production consiste à brancher ces mêmes modèles sur Supabase avec RLS et synchronisation Synapse.

