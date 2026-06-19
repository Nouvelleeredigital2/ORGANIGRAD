-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — journal d'audit des actions sensibles (Phase 3)
--
-- Trace append-only des actions sensibles (run/approve/reject/reset, gestion des
-- clés…) : qui, quoi, sur quelle ressource, résultat, quand. Écrit par
-- l'orchestrateur en service_role ; lisible par les membres du workspace via RLS.
-- Additive et idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.audit_log (
    id            bigint generated always as identity primary key,
    workspace_id  uuid not null references public.workspaces (id) on delete cascade,
    actor_kind    text not null check (actor_kind in ('user', 'api_key', 'orchestrator')),
    actor_id      text,
    action        text not null,
    resource_type text not null,
    resource_id   text,
    result        text not null check (result in ('success', 'denied', 'error')),
    metadata      jsonb,
    ip            text,
    request_id    text,
    created_at    timestamptz not null default now()
);

create index if not exists audit_log_ws_created_idx
    on public.audit_log (workspace_id, created_at desc);
create index if not exists audit_log_resource_idx
    on public.audit_log (resource_type, resource_id);

alter table public.audit_log enable row level security;

-- Lecture : membres du workspace (réutilise le helper existant en prod).
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
    for select using (
        exists (
            select 1 from public.workspace_members m
             where m.workspace_id = audit_log.workspace_id
               and m.user_id = auth.uid()
        )
    );

-- Pas de policy INSERT/UPDATE/DELETE : journal append-only, alimenté uniquement
-- par le service_role (qui contourne RLS). Aucun client ne peut écrire/modifier.

-- Rollback :
-- drop table if exists public.audit_log;
