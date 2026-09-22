# Claude — catalogue des missions attribuées

14 septembre 2026. Candidat local uniquement, aucune application distante demandée.

SQL : `supabase/migrations/20260914160000_project_service_missions.sql`.
SHA256 : `C88F93D23C2E949B8DB03B832B8D3042C183306D1DD541966465A71C6618ACFE`.

Qualifier la cible OrganiGrad selon le garde-fou infrastructure et l'historique effectivement appliqué. Ne rejouer aucun des anciens lots circuits. Ce candidat dépend des tables natives `projects`, `workspace_api_keys`, `workspace_members`, `hybrid_nodes`, `team_circuits`, `circuit_executions`, et du candidat de délégations `20260914110000_project_service_delegations.sql`. Le nom d'un nœud est `hybrid_nodes.nom` ; ne pas substituer une colonne `name` inventée par une fixture. Comparer les noms, types et contraintes réels avant toute intervention ultérieure.

Le candidat ajoute une fonction de lecture, sans nouvelle table ni contenu copié. RLS existante inchangée ; fonction SECURITY DEFINER, search_path vide, EXECUTE révoqué à public/anon/authenticated/service_role puis réaccordé au seul service_role. Le service ne reçoit pas de droits directs supplémentaires sur les tables.

`GET /api/service-missions` utilise l'identité de clé technique vérifiée. Les paramètres application/espace natif/ressource sont une cible, jamais une substitution de clé ou du workspace OrganiGrad authentifié. Résultats limités aux grants actuels `step:execute` avec scope de clé `node:run`, administrateur donneur toujours éligible, projet actif et nœud logiciel/agent. Seule l'étape courante prête, attribuée au bon nœud, est proposée. Le projet et la version du dossier doivent correspondre à leurs données natives. Une étape d'approbation n'est pas un travail délégué par cette liste.

La pagination porte sur le couple runId/grantId, pour distinguer deux dossiers utilisant le même bot. Aucune instruction privée ni production n'est retournée. Le lien canonique est construit par le helper natif `nativeProjectRef`. La liste est un instantané : le POST de rattachement et toute exécution doivent contrôler à nouveau l'autorité, la version et l'étape. Choisir une mission ne réserve pas un worker et ne démarre aucun audit.

Consommateur local : catalogue UX `/api/hermes/mission-catalogue`, avec session native existante, instance serveur explicite, contrôles avant/après lecture et transport, puis sélecteur dans `MissionProjectPanel`. Le relais UX précise l'alignement Unicode des identifiants d'étape (1 à 128 caractères) ; conserver consommateur et candidat M18 cohérents. Aucun rapprochement par nom de projet.

Le montage reste derrière les flags existants projets/circuits/délégations, fermés tant que non qualifiés. Aucun nouveau secret n'a été provisionné. Retour arrière : fermer le parcours et conserver dossiers/historique ; la fonction de catalogue n'écrit aucune donnée.

Preuve locale : 16 tests PGlite/Fastify couvrent les cibles étrangères, droits retirés, pause, version incohérente, autre responsable/projet, approbation refusée, pagination, accès navigateur interdit et expiration avant réponse. Fixture réalignée sur `hybrid_nodes.nom` après revue indépendante. Ce n'est pas une preuve Supabase ni une recette de compte réel.
