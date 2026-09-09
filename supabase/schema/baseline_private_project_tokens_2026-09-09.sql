-- Local private-projects pilot. Requires projects_and_tasks and Supabase-owned auth tables.
-- No production application is implied. Browser roles have no access.
begin;
create table if not exists public.personal_project_tokens (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    workspace_id uuid not null,
    project_id uuid not null,
    session_id uuid not null references auth.sessions(id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 80 and length(name) <= 80),
    token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
    token_prefix text not null check (token_prefix ~ '^ogp_[0-9a-f]{8}$'),
    scopes text[] not null default array['projects:read']::text[]
        check (scopes = array['projects:read']::text[]),
    issuer_expires_at bigint not null check (issuer_expires_at between 1 and 253402300799),
    expires_at bigint not null check (expires_at > 0 and expires_at <= issuer_expires_at),
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    foreign key (workspace_id, project_id) references public.projects(workspace_id,id) on delete cascade
);
create index if not exists personal_project_tokens_owner_idx on public.personal_project_tokens(owner_id,workspace_id,project_id,id);
create index if not exists personal_project_tokens_project_idx on public.personal_project_tokens(workspace_id,project_id);
create index if not exists personal_project_tokens_session_idx on public.personal_project_tokens(session_id);
alter table public.personal_project_tokens enable row level security;
revoke all on public.personal_project_tokens from public,anon,authenticated,service_role;
grant select,insert on public.personal_project_tokens to service_role;
grant update (revoked_at) on public.personal_project_tokens to service_role;

create or replace function public.guard_personal_project_token() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
    if tg_op = 'UPDATE' then
        if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at')
           or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
           or new.revoked_at is null then
            raise exception 'PERSONAL_PROJECT_TOKEN_IMMUTABLE' using errcode='23514';
        end if;
    else
        if new.revoked_at is not null or new.expires_at <= extract(epoch from clock_timestamp()) then
            raise exception 'PERSONAL_PROJECT_TOKEN_INVALID' using errcode='23514';
        end if;
        new.created_at := clock_timestamp();
        if not exists (
            select 1 from auth.sessions s join auth.users u on u.id=s.user_id
            join public.workspace_members m on m.user_id=u.id and m.workspace_id=new.workspace_id
            where s.id=new.session_id and s.user_id=new.owner_id
              and u.is_anonymous=false and (u.banned_until is null or u.banned_until <= clock_timestamp())
              and s.created_at <= clock_timestamp()
              and (s.not_after is null or (s.not_after > clock_timestamp() and new.expires_at <= extract(epoch from s.not_after)))
              and m.role::text in ('owner','admin','member','viewer')
        ) then
            raise exception 'PERSONAL_PROJECT_TOKEN_INVALID' using errcode='23514';
        end if;
    end if;
    return new;
end $$;
revoke all on function public.guard_personal_project_token() from public,anon,authenticated;
drop trigger if exists personal_project_token_guard on public.personal_project_tokens;
create trigger personal_project_token_guard before insert or update on public.personal_project_tokens
for each row execute function public.guard_personal_project_token();
commit;

