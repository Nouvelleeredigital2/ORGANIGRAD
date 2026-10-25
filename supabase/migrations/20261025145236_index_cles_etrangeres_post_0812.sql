-- Lot 1.3 de l'audit du 22/10/2026 : index des clés étrangères non couvertes.
--
-- Liste relevée en base le 25/10 (xucmfdggetwxmpquqjvj), et non reprise de l'analyse
-- statique de l'audit : 16 clés étrangères sur 48 sans index dont elles soient le préfixe.
-- Trois entrées de l'audit n'étaient pas des clés étrangères (notifications, hybrid_nodes,
-- bot_activation_receipts) et trois vraies manquaient (circuit_schedule_cursors,
-- circuit_schedule_occurrences et synapse_project_links sur (circuit|workspace, project)).
-- Plus grosse table : 20 lignes. Création simple, sans CONCURRENTLY.

create index if not exists cer_superseded_by_idx              on public.circuit_execution_receipts (superseded_by);
create index if not exists cer_mandate_idx                    on public.circuit_execution_receipts (mandate_id);
create index if not exists circuit_executions_circuit_ws_idx  on public.circuit_executions (circuit_id, workspace_id);
create index if not exists circuit_schedule_cursors_grant_idx on public.circuit_schedule_cursors (grant_id);
create index if not exists circuit_schedule_cursors_circuit_ws_idx on public.circuit_schedule_cursors (circuit_id, workspace_id);
create index if not exists circuit_schedule_occ_circuit_ws_idx on public.circuit_schedule_occurrences (circuit_id, workspace_id);
create index if not exists circuit_schedule_occ_run_idx       on public.circuit_schedule_occurrences (run_id);
create index if not exists circuit_schedule_occ_grant_idx     on public.circuit_schedule_occurrences (grant_id);
create index if not exists circuit_service_grants_project_ws_idx on public.circuit_service_grants (project_id, workspace_id);
create index if not exists psd_audit_grant_idx                on public.project_service_delegation_audit (grant_id);
create index if not exists psd_api_key_idx                    on public.project_service_delegations (api_key_id);
create index if not exists psd_node_idx                       on public.project_service_delegations (node_id);
create index if not exists synapse_project_grants_user_idx    on public.synapse_project_grants (user_id);
create index if not exists synapse_project_links_ws_project_idx on public.synapse_project_links (workspace_id, project_id);
create index if not exists team_circuits_workspace_idx        on public.team_circuits (workspace_id);
create index if not exists team_circuits_project_ws_idx       on public.team_circuits (project_id, workspace_id);
