# Reçu de déploiement backend — 7 octobre 2026

## Périmètre

- Application : OrganiGrad, service `orchestrator`.
- Code fusionné : `69cfb1db3c99f13bb56d7ac27ee72f2068defed0` (`master`, PR #38).
- Image déployée : `organigrad-backend:sha-69cfb1db3c99f13bb56d7ac27ee72f2068defed0`.
- Identifiant d'image : `sha256:f6433096c392deb872a91795ab4b48d3a85b9a659ae64a70aa8674fa878cfb22`.
- Image précédente conservée pour retour arrière : `organigrad-backend:20261006-892a4c4`.

## Procédure et preuves

L'image a été construite depuis une archive Git du SHA fusionné, avec le label OCI
`org.opencontainers.image.revision` égal au SHA complet. Le déploiement a utilisé
`deployer-compose` sous verrou et n'a remplacé que le service `orchestrator`.

Contrôles immédiatement après bascule :

- conteneur `orchestrator` : `running`, santé Docker `healthy` ;
- image déclarée : étiquette immuable exacte ci-dessus ;
- label de révision : SHA fusionné exact ;
- `GET http://127.0.0.1:3001/healthz` : HTTP 200, corps `{"ok":true}` ;
- journal de démarrage : consommateur Synapse actif en mode PostgreSQL ;
- verrou de déploiement relâché ;
- sauvegarde Compose : `/opt/organigrad/docker-compose.yml.bak-20261007T111024Z`.

## Limite de validation

Ce déploiement ne tourne aucun secret et n'applique aucune migration. Les anciennes
valeurs Supabase exposées lors de l'incident du 6 octobre restent à révoquer de façon
coordonnée côté fournisseur. La recette métier A/B reste donc gelée et aucun niveau
`CROSS_APP_VERIFIED`, `BUSINESS_PATH_VERIFIED` ou `ONLINE_VERIFIED` supplémentaire
n'est attribué par ce reçu.
