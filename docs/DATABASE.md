# Données et schéma

## Source de vérité

PostgreSQL/Supabase est la source de vérité du mode connecté. La SPA utilise aussi `localStorage` en mode hors ligne ; ce stockage n’est ni partagé, ni multi-utilisateur, ni protégé par RLS.

## Groupes de données observés

- Identité et espaces : `profiles`, `workspaces`, `workspace_members`, `workspace_invitations`, `workspace_api_keys`.
- Orchestration : `hybrid_nodes`, `node_transitions`, `notifications`, `audit_log`.
- Organigramme RH : `org_agents`.
- Projets : `projects`, `project_tasks`, `personal_project_tokens`.
- Bots : `bot_profiles`, `bot_activation_receipts` et métadonnées de portraits.
- Circuits : `team_circuits`, `circuit_executions`, `circuit_step_attempts`, `circuit_execution_receipts`.
- Planification : `circuit_service_grants`, `circuit_schedule_cursors`, `circuit_schedule_occurrences`.
- Délégations : `project_service_delegations`, `project_service_delegation_audit`.

Les tables métier portent un `workspace_id` ou sont reliées à une ressource qui le porte. Les clés étrangères, indexes et policies détaillés sont dans les baselines et migrations SQL.

## Sécurité et cohérence

- RLS activée sur les tables exposées au navigateur.
- fonctions de rôle `is_workspace_member`, `workspace_role_of` et `has_workspace_role` ;
- clés API stockées hashées, révocation et expiration ;
- garde des statuts de nœuds côté base ;
- journal append-only des transitions ;
- verrou optimiste basé sur `updated_at` pour les fiches/nœuds et sur `version` pour projets/tâches ;
- imports RH sérialisés et atomiques ;
- reçus, empreintes et clés d’idempotence pour les circuits et notifications.

## Migrations

Les migrations antérieures au 3 août 2026 ne reconstruisent pas une base vierge. Pour un nouvel environnement, utiliser `supabase/schema/baseline_2026-08-03.sql`, puis les migrations postérieures sélectionnées après revue.

Le dépôt local est derrière `origin/master` de sept commits. Le suivi distant contient notamment un banc Supabase local et une mise à jour de `supabase/schema/README.md`; toute évolution doit d’abord réconcilier la branche et les changements locaux sans écrasement.

## Niveau de preuve actuel

- Schéma et migrations lus.
- Tests PGlite présents et majoritairement exécutés via la suite orchestrateur.
- Suites PostgreSQL réelles non exécutées pendant cet audit : aucun `TEST_DATABASE_URL` isolé n’a été fourni.
- Schéma Supabase déployé et historique de migrations non revalidés le 23 septembre 2026.
- Les documents d’août rapportent une validation antérieure ; elle ne vaut pas preuve actuelle.

