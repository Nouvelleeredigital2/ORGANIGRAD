-- Report du Lot 1 de l'audit du 22/10/2026 (fondations des données), appliqué en production
-- le 25/10/2026 et relu en base après application :
--   20261025145236_index_cles_etrangeres_post_0812.sql
--   20261025145248_liberer_reservations_notifications.sql
-- Contenu identique aux deux migrations, sans leurs commentaires d'en-tête.

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

create or replace function public.release_stale_notification_reservations(
  p_older_than interval default interval '15 minutes'
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.notifications
       set status = 'failed',
           error = coalesce(error, 'reservation_expired'),
           idempotency_key = null
     where status = 'pending'
       and created_at < now() - p_older_than
    returning 1
  )
  select count(*)::int from released;
$$;

revoke execute on function public.release_stale_notification_reservations(interval) from public, anon, authenticated;
grant execute on function public.release_stale_notification_reservations(interval) to service_role;

comment on function public.release_stale_notification_reservations(interval) is
  'Libère les réservations notify-email restées pending (audit du 22/10/2026, Lot 1.6).';
