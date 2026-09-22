-- Additive. Application routes own writes; no browser/REST writes to execution state.
create unique index if not exists projects_id_workspace_circuits_idx on public.projects(id, workspace_id);
create table if not exists public.team_circuits (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id),
 project_id uuid not null,
 version integer not null default 1 check(version > 0),
 definition jsonb not null check(jsonb_typeof(definition) = 'object'),
 enabled boolean not null default false,
 created_by uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 unique(id,workspace_id),
 foreign key(project_id,workspace_id) references public.projects(id,workspace_id)
);
create table if not exists public.circuit_executions (
 id uuid primary key,
 workspace_id uuid not null,
 circuit_id uuid not null,
 idempotency_key uuid not null,
 created_by uuid not null,
 version integer not null check(version > 0),
 state jsonb not null check(jsonb_typeof(state)='object'),
 updated_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,idempotency_key),
 foreign key(circuit_id,workspace_id) references public.team_circuits(id,workspace_id)
);
create index if not exists circuit_executions_recent on public.circuit_executions(workspace_id,updated_at desc);
alter table public.team_circuits enable row level security;
alter table public.circuit_executions enable row level security;
revoke all on public.team_circuits,public.circuit_executions from public,anon,authenticated;
-- Even reads go through the API to enforce project feature activation and current membership.
