-- Cloisonnement des projets ouverts depuis Synapse.
-- Les projets OrganiGrad natifs conservent les droits historiques du workspace.
-- Un projet portant une liaison Synapse n'est visible qu'aux owner/admin du
-- workspace, à son créateur natif et aux comptes explicitement accordés.

create or replace function public.can_access_project(
    target_project_id uuid,
    target_workspace_id uuid,
    write_access boolean default false
) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1
        from public.workspace_members membership
        where membership.workspace_id = target_workspace_id
          and membership.user_id = (select auth.uid())
          and (
              (not write_access and membership.role::text in ('owner','admin','member','viewer'))
              or (write_access and membership.role::text in ('owner','admin','member'))
          )
          and (
              membership.role::text in ('owner','admin')
              or not exists (
                  select 1 from public.synapse_project_links link
                  where link.project_id = target_project_id
                    and link.workspace_id = target_workspace_id
              )
              or exists (
                  select 1 from public.synapse_project_links link
                  where link.project_id = target_project_id
                    and link.workspace_id = target_workspace_id
                    and link.created_by = (select auth.uid())
              )
              or exists (
                  select 1 from public.synapse_project_grants grant_row
                  where grant_row.project_id = target_project_id
                    and grant_row.workspace_id = target_workspace_id
                    and grant_row.user_id = (select auth.uid())
              )
          )
    );
$$;

revoke all on function public.can_access_project(uuid, uuid, boolean) from public, anon;
grant execute on function public.can_access_project(uuid, uuid, boolean) to authenticated;
grant select on public.synapse_project_links, public.synapse_project_grants to service_role;

drop policy if exists projects_read on public.projects;
drop policy if exists projects_create on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists project_tasks_read on public.project_tasks;
drop policy if exists project_tasks_create on public.project_tasks;
drop policy if exists project_tasks_update on public.project_tasks;

create policy projects_read on public.projects for select to authenticated
using (public.can_access_project(id, workspace_id, false));

create policy projects_create on public.projects for insert to authenticated
with check (public.can_access_project(id, workspace_id, true));

create policy projects_update on public.projects for update to authenticated
using (public.can_access_project(id, workspace_id, true))
with check (public.can_access_project(id, workspace_id, true));

create policy project_tasks_read on public.project_tasks for select to authenticated
using (public.can_access_project(project_id, workspace_id, false));

create policy project_tasks_create on public.project_tasks for insert to authenticated
with check (public.can_access_project(project_id, workspace_id, true));

create policy project_tasks_update on public.project_tasks for update to authenticated
using (public.can_access_project(project_id, workspace_id, true))
with check (public.can_access_project(project_id, workspace_id, true));

comment on function public.can_access_project(uuid, uuid, boolean) is
    'Autorisation projet : droits workspace historiques pour les projets natifs, grants explicites pour les projets lies a Synapse.';
