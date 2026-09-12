-- Internal durable dispatch protocol. No browser grants and no implicit service grant.
create unique index if not exists circuit_executions_id_workspace_attempts_idx
    on public.circuit_executions(id,workspace_id);
create table if not exists public.circuit_step_attempts (
    run_id uuid not null,
    workspace_id uuid not null,
    run_version integer not null check(run_version > 0),
    step_id text not null check(length(step_id) between 1 and 128),
    payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
    fencing_token uuid not null,
    status text not null check(status in ('reserved','dispatched','uncertain','accepted')),
    lease_until timestamptz not null,
    dispatched_at timestamptz,
    job_id uuid,
    updated_at timestamptz not null default clock_timestamp(),
    primary key(run_id,run_version,step_id),
    foreign key(run_id,workspace_id) references public.circuit_executions(id,workspace_id),
    check((status='reserved') = (dispatched_at is null)),
    check((status='accepted') = (job_id is not null))
);
create index if not exists circuit_step_attempts_pending_idx
    on public.circuit_step_attempts(workspace_id,run_id,step_id,status);
alter table public.circuit_step_attempts enable row level security;
revoke all on public.circuit_step_attempts from public,anon,authenticated;
