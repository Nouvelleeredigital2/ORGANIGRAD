-- Verified activation is deliberately separate from bot profile editing.
-- A bot remains a draft until an owner or admin validates its current profile.
-- This migration is additive and does not activate existing profiles.

create table if not exists public.bot_activation_receipts (
    id uuid primary key default gen_random_uuid(),
    bot_id uuid not null references public.bot_profiles(id) on delete cascade,
    workspace_id uuid not null,
    actor_id uuid not null,
    action text not null check (action in ('activated', 'deactivated')),
    reason text,
    compiled_sha256 text not null,
    verification jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    check (reason is null or length(reason) between 1 and 1000)
);

create index if not exists bot_activation_receipts_bot_created_idx
    on public.bot_activation_receipts (bot_id, created_at desc);

alter table public.bot_activation_receipts enable row level security;
revoke all on public.bot_activation_receipts from public, anon, authenticated, service_role;

-- The API returns receipts through the explicit activation endpoints. There is
-- no direct browser access to this audit trail until a dedicated read policy is
-- introduced with the project audit UI.

create or replace function public.bot_activation_status(p_bot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_bot public.bot_profiles%rowtype;
    v_actor uuid := auth.uid();
    v_checks jsonb;
    v_ready boolean;
begin
    select * into v_bot from public.bot_profiles where id = p_bot_id;
    if not found then
        raise exception 'BOT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if not exists (
        select 1 from public.workspace_members
        where workspace_id = v_bot.workspace_id and user_id = v_actor
    ) then
        raise exception 'NOT_A_WORKSPACE_MEMBER' using errcode = '42501';
    end if;

    v_checks := jsonb_build_array(
        jsonb_build_object(
            'code', 'identity',
            'label', 'Identité runtime et fichier',
            'passed', length(btrim(v_bot.runtime_id)) > 0
                and length(btrim(v_bot.file_name)) > 0
                and length(btrim(v_bot.display_name)) > 0
        ),
        jsonb_build_object(
            'code', 'mission',
            'label', 'Mission définie',
            'passed', length(btrim(v_bot.mission)) > 0
        ),
        jsonb_build_object(
            'code', 'compiled_prompt',
            'label', 'Prompt compilé et empreinte',
            'passed', length(btrim(v_bot.compiled_prompt)) > 0
                and v_bot.compiled_sha256 ~ '^[0-9a-f]{64}$'
        ),
        jsonb_build_object(
            'code', 'model',
            'label', 'Modèle déclaré',
            'passed', coalesce(nullif(v_bot.model->>'provider', ''), '') <> ''
                and coalesce(nullif(v_bot.model->>'model', ''), '') <> ''
        ),
        jsonb_build_object(
            'code', 'sources',
            'label', 'Sources requises pour la veille et la marque',
            'passed', case
                when v_bot.family not in ('veilleur', 'gardien') then true
                else jsonb_array_length(v_bot.sources) > 0
                    and not exists (
                        select 1 from jsonb_array_elements(v_bot.sources) source
                        where coalesce(nullif(btrim(source->>'label'), ''), '') = ''
                           or coalesce(source->>'url', '') !~ '^https?://[^[:space:]]+$'
                    )
            end
        )
    );

    select bool_and(coalesce((item->>'passed')::boolean, false)) into v_ready
    from jsonb_array_elements(v_checks) item;

    return jsonb_build_object(
        'botId', v_bot.id,
        'workspaceId', v_bot.workspace_id,
        'enabled', v_bot.enabled,
        'ready', coalesce(v_ready, false),
        'checks', v_checks
    );
end;
$$;

create or replace function public.activate_verified_bot(p_bot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_bot public.bot_profiles%rowtype;
    v_actor uuid := auth.uid();
    v_status jsonb;
begin
    select * into v_bot from public.bot_profiles where id = p_bot_id for update;
    if not found then
        raise exception 'BOT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if not exists (
        select 1 from public.workspace_members
        where workspace_id = v_bot.workspace_id and user_id = v_actor and role in ('owner', 'admin')
    ) then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    v_status := public.bot_activation_status(p_bot_id);
    if coalesce((v_status->>'ready')::boolean, false) is false then
        raise exception 'ACTIVATION_CHECK_FAILED' using errcode = '23514', detail = v_status::text;
    end if;

    if not v_bot.enabled then
        perform set_config('app.bot_activation_verified', 'on', true);
        update public.bot_profiles set enabled = true where id = p_bot_id;
        insert into public.bot_activation_receipts
            (bot_id, workspace_id, actor_id, action, compiled_sha256, verification)
        values
            (v_bot.id, v_bot.workspace_id, v_actor, 'activated', v_bot.compiled_sha256, v_status);
    end if;

    return jsonb_build_object('status', 'activated', 'botId', v_bot.id, 'actorId', v_actor, 'verification', v_status);
end;
$$;

create or replace function public.deactivate_bot(p_bot_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_bot public.bot_profiles%rowtype;
    v_actor uuid := auth.uid();
begin
    if coalesce(length(btrim(p_reason)), 0) = 0 or length(p_reason) > 1000 then
        raise exception 'DEACTIVATION_REASON_REQUIRED' using errcode = '22023';
    end if;

    select * into v_bot from public.bot_profiles where id = p_bot_id for update;
    if not found then
        raise exception 'BOT_NOT_FOUND' using errcode = 'P0002';
    end if;

    if not exists (
        select 1 from public.workspace_members
        where workspace_id = v_bot.workspace_id and user_id = v_actor and role in ('owner', 'admin')
    ) then
        raise exception 'ADMIN_REQUIRED' using errcode = '42501';
    end if;

    if v_bot.enabled then
        update public.bot_profiles set enabled = false where id = p_bot_id;
        insert into public.bot_activation_receipts
            (bot_id, workspace_id, actor_id, action, reason, compiled_sha256, verification)
        values
            (v_bot.id, v_bot.workspace_id, v_actor, 'deactivated', p_reason, v_bot.compiled_sha256,
             jsonb_build_object('status', 'deactivated'));
    end if;

    return jsonb_build_object('status', 'draft', 'botId', v_bot.id, 'actorId', v_actor);
end;
$$;

-- The guard stays in place for every direct update. Only the owner/admin
-- command above sets this transaction-local marker after its checks pass.
--
-- The marker alone is NOT sufficient, and this is deliberate. `set_config` is
-- callable by any authenticated user, `authenticated` holds UPDATE on this
-- table, and the `bot_profiles_update` policy admits `member` as well as
-- `owner`/`admin`. A `member` could therefore set the marker itself and flip
-- `enabled` directly, bypassing every check that `activate_verified_bot`
-- performs — a weaker role than the one that RPC requires. The role test below
-- closes that path: the marker becomes necessary but not sufficient.
--
-- `auth.uid()` is schema-qualified because search_path excludes `auth`. It
-- resolves inside the SECURITY DEFINER RPC too, since it reads the request JWT
-- rather than the current role.
create or replace function public.guard_bot_activation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
    if TG_OP = 'INSERT' then
        NEW.enabled := false;
    elsif NEW.enabled = true and OLD.enabled = false
          and (coalesce(current_setting('app.bot_activation_verified', true), '') <> 'on'
               or not exists (
                   select 1 from public.workspace_members
                   where workspace_id = NEW.workspace_id
                     and user_id = auth.uid()
                     and role in ('owner', 'admin')
               )) then
        raise exception 'activation_requires_verification' using errcode = '23514';
    end if;
    return NEW;
end;
$$;

revoke all on function public.bot_activation_status(uuid) from public, anon, service_role;
revoke all on function public.activate_verified_bot(uuid) from public, anon, service_role;
revoke all on function public.deactivate_bot(uuid, text) from public, anon, service_role;
grant execute on function public.bot_activation_status(uuid) to authenticated;
grant execute on function public.activate_verified_bot(uuid) to authenticated;
grant execute on function public.deactivate_bot(uuid, text) to authenticated;
