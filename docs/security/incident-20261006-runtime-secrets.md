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

### Qualification complémentaire du 6 octobre

Une recherche par égalité exacte sur les fichiers de configuration du VPS confirme que
les deux valeurs actives sont chargées depuis `/opt/organigrad/.env`. Les autres
occurrences trouvées sur le VPS sont uniquement des sauvegardes privées OrganiGrad ou
une sauvegarde privée de raccordement conservée par Synapse. Aucun second consommateur
actif Docker n'a été trouvé.

Cette observation ne couvre pas les consommateurs gérés par le fournisseur : secrets
d'Edge Functions, connecteurs MCP, automatisations et outils extérieurs au VPS. La clé
`service_role` est en outre utilisée comme secret d'authentification par `notify-email`
dans le code. Aucune fenêtre de coexistence ni procédure de révocation fournisseur n'a
pu être prouvée avec les accès disponibles. La rotation a donc été explicitement gelée,
sans tentative répétée ni substitution de cible. La recette A/B demeure gelée pour la
même raison.

### Préparation de la rotation sans coupure

Le code prépare désormais une coexistence explicite : l'orchestrateur préfère
`SUPABASE_SECRET_KEY` et transmet cette clé dans `apikey`; la fonction accepte les
clés injectées dans `SUPABASE_SECRET_KEYS` tout en conservant le Bearer legacy pendant
la seule fenêtre de bascule. Un JSON de clés invalide échoue fermé. La fonction utilise
Brevo et ne transforme plus une configuration fournisseur absente en faux succès.

Cette préparation est une validation de code, pas une rotation distante. L'accès au
projet exact `xucmfdggetwxmpquqjvj` reste nécessaire pour inventorier les secrets Edge,
créer la clé dédiée, déployer la fonction, vérifier les notifications et désactiver
l'ancienne clé. Le mot de passe PostgreSQL sera tourné séparément après la même
qualification fournisseur.

## Livraison associée

La PR #44 accepte les codes JWS signés émis par Synapse tout en conservant le format historique. Elle a été fusionnée après CI verte au SHA `892a4c4bd25ef267806cf5db6161a2384fb604bc`. L’image `organigrad-backend:20261006-892a4c4` est en service et saine ; retour arrière applicatif disponible vers `organigrad-backend:20261004-shared-f80320c6`.

Deux bascules intermédiaires ont déclenché leur retour arrière automatique à cause du script de vérification de livraison (état health encore en démarrage, puis fin de ligne shell). Les deux retours arrière ont restauré l’image précédente saine. La troisième bascule, corrigée pour attendre `healthy`, a abouti ; aucun verrou ne subsiste.
