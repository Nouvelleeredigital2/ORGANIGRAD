# Incident de sortie de secrets — 6 octobre 2026

Statut : **partiellement traité ; recette connectée gelée**.

## Déclencheur

Une commande de qualification Compose a affiché des valeurs d’environnement du conteneur OrganiGrad dans une sortie d’outil. Les valeurs ne sont pas reproduites dans le dépôt, les messages de suivi ni ce reçu.

Variables concernées :

- `LINK_BRIDGE_TOKEN` ;
- `SYNAPSE_SUITE_APP_TOKEN` ;
- `SYNAPSE_SUITE_SERVICE_CREDENTIAL` ;
- `SUPABASE_DB_URL` ;
- `SUPABASE_SERVICE_ROLE_KEY`.

## Portée qualifiée sans divulgation

La comparaison a été faite par empreintes en mémoire et n’a sorti que les noms des consommateurs.

| Variable | Consommateurs confirmés | Portée |
| --- | --- | --- |
| `LINK_BRIDGE_TOKEN` | OrganiGrad `orchestrator`; `ORGANIGRAD_BRIDGE_TOKEN` de LINK `link` et `job-runner` | Pont LINK ↔ OrganiGrad |
| `SYNAPSE_SUITE_APP_TOKEN` | OrganiGrad `orchestrator`; entrée `organigrad` de `SYNAPSE_APP_TOKENS` dans Synapse | Synapse ↔ OrganiGrad |
| `SYNAPSE_SUITE_SERVICE_CREDENTIAL` | OrganiGrad `orchestrator`; entrée `organigrad` de `SYNAPSE_SUITE_ADAPTER_CREDENTIALS` dans Synapse | Adaptateur Synapse ↔ OrganiGrad |
| `SUPABASE_DB_URL` | OrganiGrad `orchestrator` dans l’inventaire Docker | Projet Supabase OrganiGrad ; consommateurs hors Docker encore à qualifier |
| `SUPABASE_SERVICE_ROLE_KEY` | OrganiGrad `orchestrator` dans l’inventaire Docker | Projet Supabase OrganiGrad ; Edge `notify-email` potentielle |

## Rotations terminées

Les trois credentials applicatifs ont été tournés ensemble sous les verrous `link`, `organigrad` et `synapse-repo`. Les quatre fichiers d’environnement ont été sauvegardés avec le suffixe privé `bak-incident-20261005T234336Z`, permissions 0600, puis modifiés atomiquement. Seuls `orchestrator`, `synapse-backend`, `link` et `job-runner` ont été recréés.

Preuves après redémarrage :

- ancienne valeur du jeton applicatif Synapse : HTTP 401 ; nouvelle valeur : HTTP 200 ;
- ancien credential d’adaptateur : HTTP 401 ; nouveau credential : HTTP 404 sur une clé native témoin absente, ce qui prouve l’authentification sans créer de donnée ;
- ancienne valeur du pont LINK : HTTP 401 ; nouvelle valeur : HTTP 200 ;
- relations entre les variables chargées confirmées par empreintes ;
- conteneurs Synapse et OrganiGrad sains, services LINK actifs ;
- fichier de sonde éphémère supprimé et aucun verrou restant.

## Secrets encore actifs

`SUPABASE_DB_URL` et `SUPABASE_SERVICE_ROLE_KEY` n’ont pas été tournés. Leur révocation unilatérale peut couper PostgreSQL, Auth Admin ou l’Edge Function d’e-mail. Avant reprise de la recette :

1. inventorier les consommateurs Docker, Edge, MCP et automatisations de la cible `xucmfdggetwxmpquqjvj` ;
2. sauvegarder la configuration privée et préparer le retour arrière ;
3. générer ou tourner le secret chez Supabase ;
4. mettre à jour tous les consommateurs pendant la fenêtre de coexistence disponible ;
5. recréer les services concernés ;
6. vérifier SQL, Auth Admin, e-mail, santé et refus de l’ancienne valeur ;
7. révoquer définitivement l’ancienne valeur et seulement alors dégeler la recette.

## Livraison associée

La PR #44 accepte les codes JWS signés émis par Synapse tout en conservant le format historique. Elle a été fusionnée après CI verte au SHA `892a4c4bd25ef267806cf5db6161a2384fb604bc`. L’image `organigrad-backend:20261006-892a4c4` est en service et saine ; retour arrière applicatif disponible vers `organigrad-backend:20261004-shared-f80320c6`.

Deux bascules intermédiaires ont déclenché leur retour arrière automatique à cause du script de vérification de livraison (état health encore en démarrage, puis fin de ligne shell). Les deux retours arrière ont restauré l’image précédente saine. La troisième bascule, corrigée pour attendre `healthy`, a abouti ; aucun verrou ne subsiste.
