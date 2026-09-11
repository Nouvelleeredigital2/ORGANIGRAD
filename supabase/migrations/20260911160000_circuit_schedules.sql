-- Local preparation only. Grants are distinct from personal session pairings.
create table if not exists public.circuit_service_grants (
 id uuid primary key,
 workspace_id uuid not null,
 project_id uuid not null,
 granted_by uuid not null,
 action text not null default 'schedule:create' check(action='schedule:create'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 unique(id,workspace_id,project_id),
 foreign key(project_id,workspace_id) references public.projects(id,workspace_id)
);
create table if not exists public.circuit_schedule_cursors (
 circuit_id uuid primary key,
 workspace_id uuid not null,
 grant_id uuid not null references public.circuit_service_grants(id),
 next_due_at timestamptz not null,
 foreign key(circuit_id,workspace_id) references public.team_circuits(id,workspace_id)
);
create table if not exists public.circuit_schedule_occurrences (
 id uuid primary key,
 circuit_id uuid not null,
 workspace_id uuid not null,
 scheduled_for timestamptz not null,
 definition_version integer not null,
 definition jsonb not null,
 status text not null check(status in ('started','missed')),
 run_id uuid references public.circuit_executions(id),
 grant_id uuid not null references public.circuit_service_grants(id),
 recorded_at timestamptz not null,
 unique(circuit_id,scheduled_for),
 foreign key(circuit_id,workspace_id) references public.team_circuits(id,workspace_id),
 check((status='started')=(run_id is not null))
);
alter table public.circuit_service_grants enable row level security;
alter table public.circuit_schedule_cursors enable row level security;
alter table public.circuit_schedule_occurrences enable row level security;
revoke all on public.circuit_service_grants,public.circuit_schedule_cursors,public.circuit_schedule_occurrences from public,anon,authenticated;
create index if not exists circuit_schedule_due on public.circuit_schedule_cursors(next_due_at);
