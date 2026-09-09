-- Lot projets pilote, additif. Ne pas appliquer sans qualification de la cible
-- et accord opératoire. Aucun seed et aucune modification du graphe existant.
-- Pas de `begin;`/`commit;` explicite, comme les 27 migrations précédentes :
-- l'atomicité vient de la transaction implicite du lot multi-instructions. Une
-- transaction ouverte dans le fichier fait échouer le harnais d'intégration, qui
-- rejoue les migrations par `sql.unsafe` (UNSAFE_TRANSACTION).

create table public.projects (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    name text not null check (length(btrim(name)) > 0 and length(name) <= 160),
    description text not null default '' check (length(description) <= 500),
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    unique (workspace_id, id)
);

create table public.project_tasks (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    project_id uuid not null,
    title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
    description text not null default '' check (length(description) <= 2000),
    status text not null default 'todo' check (status in ('todo','running','blocked','done')),
    -- Pas de FK vers workspace_members : un responsable historique ne doit pas
    -- empêcher de retirer un membre. Le trigger valide toute nouvelle affectation.
    assignee_id uuid,
    due_date date check (due_date between date '0001-01-01' and date '9999-12-31'),
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1 check (version > 0),
    foreign key (workspace_id, project_id) references public.projects(workspace_id,id) on delete cascade
);

create index projects_workspace_updated_idx on public.projects(workspace_id, updated_at desc, id);
create index project_tasks_project_updated_idx on public.project_tasks(workspace_id, project_id, updated_at desc, id);
create index project_tasks_active_status_idx on public.project_tasks(workspace_id, project_id, status) where archived_at is null;

alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
revoke all on public.projects, public.project_tasks from public, anon, authenticated;
grant select, insert, update on public.projects, public.project_tasks to authenticated;

create policy projects_read on public.projects for select to authenticated
using (exists (select 1 from public.workspace_members m
    where m.workspace_id=projects.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member','viewer')));
create policy projects_create on public.projects for insert to authenticated
with check (exists (select 1 from public.workspace_members m
    where m.workspace_id=projects.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member')));
create policy projects_update on public.projects for update to authenticated
using (exists (select 1 from public.workspace_members m
    where m.workspace_id=projects.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member')))
with check (exists (select 1 from public.workspace_members m
    where m.workspace_id=projects.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member')));

create policy project_tasks_read on public.project_tasks for select to authenticated
using (exists (select 1 from public.workspace_members m
    where m.workspace_id=project_tasks.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member','viewer')));
create policy project_tasks_create on public.project_tasks for insert to authenticated
with check (exists (select 1 from public.workspace_members m
    where m.workspace_id=project_tasks.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member')));
create policy project_tasks_update on public.project_tasks for update to authenticated
using (exists (select 1 from public.workspace_members m
    where m.workspace_id=project_tasks.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member')))
with check (exists (select 1 from public.workspace_members m
    where m.workspace_id=project_tasks.workspace_id and m.user_id=(select auth.uid())
      and m.role::text in ('owner','admin','member')));

create function public.guard_project_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if tg_op='INSERT' then
        new.version := 1;
        new.created_at := clock_timestamp();
    else
        if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
           or new.created_at is distinct from old.created_at then
            raise exception 'PROJECT_IMMUTABLE_FIELDS' using errcode='23514';
        end if;
        if new.version is distinct from old.version + 1 then
            raise exception 'PROJECT_VERSION_CONFLICT' using errcode='23514';
        end if;
        new.version := old.version + 1;
    end if;
    new.updated_at := clock_timestamp();
    return new;
end $$;

create function public.guard_project_task_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
    project_archived timestamptz;
begin
    if tg_op='UPDATE' then
        if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id
           or new.project_id is distinct from old.project_id
           or new.created_at is distinct from old.created_at then
            raise exception 'TASK_IMMUTABLE_FIELDS' using errcode='23514';
        end if;
        if new.version is distinct from old.version + 1 then
            raise exception 'TASK_VERSION_CONFLICT' using errcode='23514';
        end if;
        new.version := old.version + 1;
    else
        new.version := 1;
        new.created_at := clock_timestamp();
    end if;
    -- Verrou de la ligne parent : l'archivage concurrent et cette mutation
    -- ne peuvent pas valider des états incompatibles.
    select p.archived_at into project_archived from public.projects p
        where p.id=new.project_id and p.workspace_id=new.workspace_id for share;
    if not found then
        raise exception 'PROJECT_NOT_ACCESSIBLE' using errcode='23503';
    end if;
    if project_archived is not null then
        raise exception 'PROJECT_ARCHIVED' using errcode='23514';
    end if;
    if new.assignee_id is not null and (tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id) then
        perform 1 from public.workspace_members m
          where m.workspace_id=new.workspace_id and m.user_id=new.assignee_id
            and m.role::text in ('owner','admin','member','viewer');
        if not found then
            raise exception 'ASSIGNEE_NOT_MEMBER' using errcode='23514';
        end if;
    end if;
    new.updated_at := clock_timestamp();
    return new;
end $$;

create trigger projects_guard before insert or update on public.projects
for each row execute function public.guard_project_mutation();
create trigger project_tasks_guard before insert or update on public.project_tasks
for each row execute function public.guard_project_task_mutation();
revoke all on function public.guard_project_mutation(), public.guard_project_task_mutation() from public, anon, authenticated;
