-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — SCHÉMA DE RÉFÉRENCE, extrait de la production le 2026-08-03
-- Projet : xucmfdggetwxmpquqjvj
--
-- POURQUOI CE FICHIER
-- Les migrations de `supabase/migrations/` NE REPRODUISENT PAS la production :
-- elles ne créent ni `profiles`, ni `workspace_invitations`, ni la vue
-- `workspace_members_view`, ni l'enum `workspace_role`, ni les fonctions
-- `touch_updated_at`, `handle_new_user`, `workspace_role_of`,
-- `verify_workspace_api_key`, `invite_workspace_member`,
-- `accept_workspace_invitation`. Rejouées sur une base vierge, elles échouent.
-- La base a été construite en partie hors dépôt, puis « réconciliée » par
-- petites touches — d'où la dérive.
--
-- COMMENT S'EN SERVIR
--   Environnement neuf  : rejouer CE fichier, puis uniquement les migrations
--                         datées APRÈS 2026-08-03.
--   Production existante: ne rien rejouer, ce fichier est un miroir.
--   Évolution du schéma : nouvelle migration horodatée dans migrations/, ET
--                         report ici — sinon la dérive recommence.
--
-- Extrait par introspection (pg_get_functiondef, pg_get_constraintdef,
-- pg_indexes, pg_policies, pg_get_triggerdef). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Types ───────────────────────────────────────────────────────────────────
do $$
begin
    if not exists (select 1 from pg_type where typname = 'workspace_role') then
        create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
    end if;
end $$;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
    id uuid not null,
    email text not null,
    display_name text,
    created_at timestamp with time zone not null default now()
);

create table if not exists public.workspaces (
    id uuid not null default gen_random_uuid(),
    name text not null,
    slug text not null,
    owner_id uuid not null,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table if not exists public.workspace_members (
    workspace_id uuid not null,
    user_id uuid not null,
    role workspace_role not null default 'member'::workspace_role,
    created_at timestamp with time zone not null default now()
);

create table if not exists public.workspace_invitations (
    id uuid not null default gen_random_uuid(),
    workspace_id uuid not null,
    email text not null,
    role workspace_role not null default 'member'::workspace_role,
    token text not null,
    created_by uuid,
    created_at timestamp with time zone not null default now(),
    accepted_at timestamp with time zone,
    accepted_by uuid,
    expires_at timestamp with time zone not null default (now() + '14 days'::interval),
    revoked_at timestamp with time zone
);

create table if not exists public.workspace_api_keys (
    id uuid not null default gen_random_uuid(),
    workspace_id uuid not null,
    name text not null,
    key_hash text not null,
    key_prefix text not null,
    created_by uuid,
    created_at timestamp with time zone not null default now(),
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    scopes text[] not null default ARRAY[]::text[],
    expires_at timestamp with time zone
);

create table if not exists public.hybrid_nodes (
    id uuid not null default gen_random_uuid(),
    workspace_id uuid not null,
    type text not null,
    nom text not null,
    role_titre text not null,
    parent_id uuid,
    grade_id text not null default 'Expert'::text,
    system_prompt text,
    skills text[] not null default '{}'::text[],
    mcp_config jsonb,
    notification_channels jsonb,
    avatar_url text,
    status text not null default 'IDLE'::text,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    -- Référence externe optionnelle (ex. 'link' pour un bot Hermes importé) ;
    -- purement informative, jamais utilisée pour l'autorisation. L'id du
    -- nœud EST l'identifiant stable de l'entité source — voir migration
    -- 20260811090000.
    external_app text
);

create table if not exists public.node_transitions (
    id uuid not null default gen_random_uuid(),
    workspace_id uuid not null,
    node_id uuid not null,
    from_status text not null,
    to_status text not null,
    payload jsonb,
    actor_kind text not null,
    actor_id uuid,
    created_at timestamp with time zone not null default now()
);

create table if not exists public.notifications (
    id uuid not null default gen_random_uuid(),
    workspace_id uuid not null,
    node_id uuid,
    channel text not null,
    target text not null,
    subject text,
    message text not null,
    status text not null default 'pending'::text,
    error text,
    created_at timestamp with time zone not null default now(),
    sent_at timestamp with time zone,
    idempotency_key text
);

create table if not exists public.audit_log (
    id bigint generated by default as identity,
    workspace_id uuid not null,
    actor_kind text not null,
    actor_id text,
    action text not null,
    resource_type text not null,
    resource_id text,
    result text not null,
    metadata jsonb,
    ip text,
    request_id text,
    created_at timestamp with time zone not null default now()
);

create table if not exists public.org_agents (
    id uuid not null default gen_random_uuid(),
    workspace_id uuid not null,
    source_kind text not null default 'manual'::text,
    source_ref text not null default ''::text,
    external_key text not null,
    nom text not null default ''::text,
    prenom text not null default ''::text,
    fonction text not null default ''::text,
    titre text not null default ''::text,
    service text not null default ''::text,
    pole text not null default ''::text,
    rattachement_id uuid,
    grade_style text not null default 'Agent'::text,
    type_temps text not null default 'Complet'::text,
    nbi text,
    avatar_url text,
    email text,
    phone text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

-- ── Contraintes ─────────────────────────────────────────────────────────────
-- `add constraint` n'est pas idempotent : on l'enveloppe.
do $$
declare
    stmt text;
begin
    foreach stmt in array array[
        'alter table public.profiles add constraint profiles_pkey primary key (id)',
        'alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade',

        'alter table public.workspaces add constraint workspaces_pkey primary key (id)',
        'alter table public.workspaces add constraint workspaces_slug_key unique (slug)',
        'alter table public.workspaces add constraint workspaces_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete restrict',

        'alter table public.workspace_members add constraint workspace_members_pkey primary key (workspace_id, user_id)',
        'alter table public.workspace_members add constraint workspace_members_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        'alter table public.workspace_members add constraint workspace_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade',

        'alter table public.workspace_invitations add constraint workspace_invitations_pkey primary key (id)',
        'alter table public.workspace_invitations add constraint workspace_invitations_token_key unique (token)',
        'alter table public.workspace_invitations add constraint workspace_invitations_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        'alter table public.workspace_invitations add constraint workspace_invitations_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null',
        'alter table public.workspace_invitations add constraint workspace_invitations_accepted_by_fkey foreign key (accepted_by) references auth.users(id) on delete set null',

        'alter table public.workspace_api_keys add constraint workspace_api_keys_pkey primary key (id)',
        'alter table public.workspace_api_keys add constraint workspace_api_keys_key_hash_key unique (key_hash)',
        'alter table public.workspace_api_keys add constraint workspace_api_keys_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        'alter table public.workspace_api_keys add constraint workspace_api_keys_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null',

        'alter table public.hybrid_nodes add constraint hybrid_nodes_pkey primary key (id)',
        'alter table public.hybrid_nodes add constraint hybrid_nodes_type_check check (type = any (array[''HUMAN''::text, ''AGENT_IA''::text, ''SOFTWARE_MCP''::text]))',
        'alter table public.hybrid_nodes add constraint hybrid_nodes_status_check check (status = any (array[''IDLE''::text, ''EXECUTING''::text, ''CONTROL_PENDING_IA''::text, ''WAITING_HUMAN_APPROVAL''::text, ''ERROR''::text]))',
        'alter table public.hybrid_nodes add constraint hybrid_nodes_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        'alter table public.hybrid_nodes add constraint hybrid_nodes_parent_id_fkey foreign key (parent_id) references public.hybrid_nodes(id) on delete set null',

        'alter table public.node_transitions add constraint node_transitions_pkey primary key (id)',
        'alter table public.node_transitions add constraint node_transitions_actor_kind_check check (actor_kind = any (array[''user''::text, ''api_key''::text, ''orchestrator''::text]))',
        'alter table public.node_transitions add constraint node_transitions_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        'alter table public.node_transitions add constraint node_transitions_node_id_fkey foreign key (node_id) references public.hybrid_nodes(id) on delete cascade',

        'alter table public.notifications add constraint notifications_pkey primary key (id)',
        'alter table public.notifications add constraint notifications_channel_check check (channel = any (array[''slack_webhook''::text, ''email''::text, ''whatsapp''::text]))',
        'alter table public.notifications add constraint notifications_status_check check (status = any (array[''pending''::text, ''sent''::text, ''failed''::text]))',
        'alter table public.notifications add constraint notifications_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        'alter table public.notifications add constraint notifications_node_id_fkey foreign key (node_id) references public.hybrid_nodes(id) on delete set null',

        'alter table public.audit_log add constraint audit_log_pkey primary key (id)',
        'alter table public.audit_log add constraint audit_log_actor_kind_check check (actor_kind = any (array[''user''::text, ''api_key''::text, ''orchestrator''::text]))',
        'alter table public.audit_log add constraint audit_log_result_check check (result = any (array[''success''::text, ''denied''::text, ''error''::text]))',
        'alter table public.audit_log add constraint audit_log_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',

        'alter table public.org_agents add constraint org_agents_pkey primary key (id)',
        'alter table public.org_agents add constraint org_agents_no_self_parent check (rattachement_id is distinct from id)',
        'alter table public.org_agents add constraint org_agents_source_kind_check check (source_kind = any (array[''import''::text, ''remote_csv''::text, ''manual''::text]))',
        'alter table public.org_agents add constraint org_agents_grade_style_check check (grade_style = any (array[''Direction''::text, ''Responsable''::text, ''Expert''::text, ''Agent''::text, ''Support''::text]))',
        'alter table public.org_agents add constraint org_agents_workspace_id_fkey foreign key (workspace_id) references public.workspaces(id) on delete cascade',
        -- Volontairement SANS `on delete` : si le trigger de reparentage
        -- échouait, la suppression lève au lieu d'orpheliner en silence.
        'alter table public.org_agents add constraint org_agents_rattachement_id_fkey foreign key (rattachement_id) references public.org_agents(id)',
        'alter table public.org_agents add constraint org_agents_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null',
        'alter table public.org_agents add constraint org_agents_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null'
    ] loop
        begin
            execute stmt;
        exception when duplicate_object or duplicate_table then null;
        end;
    end loop;
end $$;

-- ── Index ───────────────────────────────────────────────────────────────────
create index if not exists workspace_members_user_idx on public.workspace_members using btree (user_id);
create index if not exists workspace_invitations_ws_idx on public.workspace_invitations using btree (workspace_id);
create index if not exists workspace_invitations_token_idx on public.workspace_invitations using btree (token) where ((accepted_at is null) and (revoked_at is null));
create index if not exists workspace_invitations_email_idx on public.workspace_invitations using btree (workspace_id, lower(email)) where ((accepted_at is null) and (revoked_at is null));
create index if not exists workspace_api_keys_ws_idx on public.workspace_api_keys using btree (workspace_id);
create index if not exists workspace_api_keys_hash_idx on public.workspace_api_keys using btree (key_hash) where (revoked_at is null);
create index if not exists hybrid_nodes_ws_idx on public.hybrid_nodes using btree (workspace_id);
create index if not exists hybrid_nodes_parent_idx on public.hybrid_nodes using btree (parent_id);
create index if not exists hybrid_nodes_type_idx on public.hybrid_nodes using btree (type);
create index if not exists node_transitions_ws_idx on public.node_transitions using btree (workspace_id, created_at desc);
create index if not exists node_transitions_node_idx on public.node_transitions using btree (node_id, created_at desc);
create index if not exists notifications_ws_idx on public.notifications using btree (workspace_id, created_at desc);
create index if not exists notifications_node_idx on public.notifications using btree (node_id, created_at desc);
create unique index if not exists notifications_idempotency_uniq on public.notifications using btree (workspace_id, idempotency_key) where (idempotency_key is not null);
create index if not exists audit_log_ws_created_idx on public.audit_log using btree (workspace_id, created_at desc);
create index if not exists audit_log_resource_idx on public.audit_log using btree (resource_type, resource_id);
create index if not exists org_agents_workspace_idx on public.org_agents using btree (workspace_id);
create index if not exists org_agents_ws_pole_idx on public.org_agents using btree (workspace_id, pole);
create index if not exists org_agents_rattachement_idx on public.org_agents using btree (rattachement_id);
create unique index if not exists org_agents_source_identity_idx on public.org_agents using btree (workspace_id, source_kind, source_ref, external_key);

-- ── Fonctions ───────────────────────────────────────────────────────────────
-- ATTENTION aux noms de paramètres : `is_workspace_member(ws)` et
-- `workspace_role_of(ws)` — et non `p_ws` comme le suppose l'ancien rls.sql.

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path to 'pg_catalog', 'public'
as $function$
begin new.updated_at = now(); return new; end;
$function$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
    select exists(
        select 1 from public.workspace_members
        where workspace_id = ws and user_id = auth.uid()
    );
$function$;

create or replace function public.workspace_role_of(ws uuid)
returns workspace_role language sql stable security definer set search_path to 'public'
as $function$
    select role from public.workspace_members
    where workspace_id = ws and user_id = auth.uid();
$function$;

-- `role::text` : la colonne est un enum, le paramètre un text[].
create or replace function public.has_workspace_role(p_ws uuid, p_roles text[])
returns boolean language sql stable security definer set search_path to 'public'
as $function$
    select exists (
        select 1 from public.workspace_members
         where workspace_id = p_ws
           and user_id = auth.uid()
           and role::text = any(p_roles)
    );
$function$;

-- Provisionne profil + workspace personnel à la création d'un compte.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
    new_ws_id   uuid;
    local_email text := coalesce(new.email, '');
    base_name   text := nullif(split_part(local_email, '@', 1), '');
begin
    insert into public.profiles (id, email, display_name)
    values (new.id, local_email, base_name);

    insert into public.workspaces (name, slug, owner_id)
    values (
        coalesce(base_name, 'workspace') || ' workspace',
        lower(replace(gen_random_uuid()::text, '-', '')),
        new.id
    ) returning id into new_ws_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_ws_id, new.id, 'owner');

    return new;
end; $function$;

-- Verrou de statut côté client + parent dans le même workspace.
create or replace function public.tg_hybrid_nodes_client_guard()
returns trigger language plpgsql set search_path to ''
as $function$
begin
    if current_user in ('authenticated', 'anon') then
        if tg_op = 'INSERT' then
            new.status := 'IDLE';
        elsif tg_op = 'UPDATE' then
            new.status := old.status;
        end if;
    end if;
    new.updated_at := now();

    if new.parent_id is not null then
        if not exists (
            select 1 from public.hybrid_nodes p
             where p.id = new.parent_id and p.workspace_id = new.workspace_id
        ) then
            raise exception 'parent_id % hors du workspace %', new.parent_id, new.workspace_id
                using errcode = '23514';
        end if;
    end if;

    return new;
end;
$function$;

create or replace function public.create_workspace_api_key(p_workspace_id uuid, p_name text)
returns table(id uuid, raw_key text, key_prefix text, created_at timestamp with time zone)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
    raw     text;
    prefix  text;
    hashed  text;
    new_id  uuid;
    created timestamptz;
begin
    if public.workspace_role_of(p_workspace_id) not in ('owner','admin') then
        raise exception 'forbidden';
    end if;

    raw    := 'ok_' || encode(extensions.gen_random_bytes(16), 'hex');
    prefix := substring(raw from 1 for 11);
    hashed := encode(extensions.digest(raw, 'sha256'), 'hex');

    insert into public.workspace_api_keys
        (workspace_id, name, key_hash, key_prefix, created_by, scopes)
    values
        (p_workspace_id, p_name, hashed, prefix, auth.uid(),
         array['graph:read','node:read','node:run','execution:read']::text[])
    returning workspace_api_keys.id, workspace_api_keys.created_at
        into  new_id, created;

    return query select new_id, raw, prefix, created;
end;
$function$;

create or replace function public.verify_workspace_api_key(raw_key text)
returns uuid language plpgsql security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
    h  text := encode(extensions.digest(raw_key, 'sha256'), 'hex');
    ws uuid;
begin
    update public.workspace_api_keys
       set last_used_at = now()
     where key_hash = h and revoked_at is null
    returning workspace_id into ws;
    return ws;
end;
$function$;

create or replace function public.invite_workspace_member(
    p_workspace_id uuid, p_email text, p_role workspace_role default 'member'::workspace_role)
returns table(id uuid, token text, expires_at timestamp with time zone)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
    norm_email text := lower(trim(p_email));
    new_token  text;
    new_id     uuid;
    new_exp    timestamptz;
begin
    if public.workspace_role_of(p_workspace_id) not in ('owner','admin') then
        raise exception 'forbidden';
    end if;
    if norm_email = '' then
        raise exception 'email_required';
    end if;
    if p_role = 'owner' then
        raise exception 'owner_role_not_invitable';
    end if;

    -- Alias `wi` obligatoire : les colonnes OUT (id, token, expires_at)
    -- sont des variables PL/pgSQL et rendraient `expires_at` ambigu
    -- (voir migration 20260805150000).
    if exists (
        select 1 from public.workspace_invitations wi
        where wi.workspace_id = p_workspace_id
          and lower(wi.email) = norm_email
          and wi.accepted_at is null
          and wi.revoked_at is null
          and wi.expires_at > now()
    ) then
        raise exception 'invitation_already_pending';
    end if;

    new_token := 'inv_' || encode(extensions.gen_random_bytes(16), 'hex');

    insert into public.workspace_invitations
        (workspace_id, email, role, token, created_by)
    values
        (p_workspace_id, norm_email, p_role, new_token, auth.uid())
    returning workspace_invitations.id, workspace_invitations.expires_at
        into  new_id, new_exp;

    return query select new_id, new_token, new_exp;
end;
$function$;

create or replace function public.accept_workspace_invitation(p_token text)
returns table(workspace_id uuid, role workspace_role)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
-- Pragma obligatoire : les colonnes OUT (workspace_id, role) sont des
-- variables PL/pgSQL et rendraient ambiguë la liste de colonnes de
-- `on conflict (workspace_id, user_id)` (voir migration 20260805150100).
#variable_conflict use_column
declare
    inv record;
    user_email text;
begin
    if auth.uid() is null then
        raise exception 'unauthenticated';
    end if;

    select email into user_email from auth.users where id = auth.uid();

    select * into inv
      from public.workspace_invitations
     where token = p_token
       and accepted_at is null
       and revoked_at is null
       and expires_at > now()
     limit 1
     for update;

    if not found then
        raise exception 'invitation_not_found_or_expired';
    end if;

    if lower(inv.email) <> lower(coalesce(user_email, '')) then
        raise exception 'email_mismatch';
    end if;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, auth.uid(), inv.role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;

    update public.workspace_invitations
       set accepted_at = now(), accepted_by = auth.uid()
     where id = inv.id;

    return query select inv.workspace_id, inv.role;
end;
$function$;

-- Les fonctions propres à org_agents (tg_org_agents_guard,
-- tg_org_agents_reparent_children, import_org_agents) sont définies par les
-- migrations 20260803120000 / 20260803120200 et reprises ici par référence.

-- ── Triggers ────────────────────────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
    before update on public.workspaces
    for each row execute function public.touch_updated_at();

drop trigger if exists hybrid_nodes_updated_at on public.hybrid_nodes;
create trigger hybrid_nodes_updated_at
    before update on public.hybrid_nodes
    for each row execute function public.touch_updated_at();

drop trigger if exists hybrid_nodes_client_guard on public.hybrid_nodes;
create trigger hybrid_nodes_client_guard
    before insert or update on public.hybrid_nodes
    for each row execute function public.tg_hybrid_nodes_client_guard();

-- ── Vue ─────────────────────────────────────────────────────────────────────
create or replace view public.workspace_members_view as
 select wm.workspace_id, wm.user_id, wm.role, wm.created_at, p.email, p.display_name
   from public.workspace_members wm
   left join public.profiles p on p.id = wm.user_id;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles              enable row level security;
alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_api_keys    enable row level security;
alter table public.hybrid_nodes          enable row level security;
alter table public.node_transitions      enable row level security;
alter table public.notifications         enable row level security;
alter table public.audit_log             enable row level security;
alter table public.org_agents            enable row level security;

-- profiles
drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select using (id = auth.uid());
drop policy if exists "profile self update" on public.profiles;
create policy "profile self update" on public.profiles for update using (id = auth.uid());

-- workspaces
drop policy if exists "ws read members" on public.workspaces;
create policy "ws read members" on public.workspaces for select using (public.is_workspace_member(id));
drop policy if exists "ws create authed" on public.workspaces;
create policy "ws create authed" on public.workspaces for insert with check (auth.uid() = owner_id);
drop policy if exists "ws update owners" on public.workspaces;
create policy "ws update owners" on public.workspaces for update using (public.workspace_role_of(id) = 'owner');
drop policy if exists "ws delete owners" on public.workspaces;
create policy "ws delete owners" on public.workspaces for delete using (public.workspace_role_of(id) = 'owner');

-- workspace_members
drop policy if exists "wm read members" on public.workspace_members;
create policy "wm read members" on public.workspace_members for select using (public.is_workspace_member(workspace_id));
-- (2026-08-29) "wm write admin" (FOR ALL) remplacée par des policies par
-- commande protégeant la ligne du owner — cf. migration
-- 20260829120000_wm_write_admin_owner_guard.sql.
drop policy if exists "wm write admin" on public.workspace_members;
drop policy if exists "wm insert admin" on public.workspace_members;
create policy "wm insert admin" on public.workspace_members for insert with check (
    public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
    and role <> 'owner'::workspace_role
);
drop policy if exists "wm update admin" on public.workspace_members;
create policy "wm update admin" on public.workspace_members for update
    using (
        public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
        and not exists (
            select 1 from public.workspaces w
             where w.id = workspace_members.workspace_id
               and w.owner_id = workspace_members.user_id
        )
    )
    with check (
        public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
        and role <> 'owner'::workspace_role
        and not exists (
            select 1 from public.workspaces w
             where w.id = workspace_members.workspace_id
               and w.owner_id = workspace_members.user_id
        )
    );
drop policy if exists "wm delete admin" on public.workspace_members;
create policy "wm delete admin" on public.workspace_members for delete using (
    public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
    and not exists (select 1 from public.workspaces w where w.id = workspace_members.workspace_id and w.owner_id = workspace_members.user_id)
);
drop policy if exists "wm leave self" on public.workspace_members;
create policy "wm leave self" on public.workspace_members for delete using (
    user_id = auth.uid()
    and not exists (select 1 from public.workspaces w where w.id = workspace_members.workspace_id and w.owner_id = auth.uid())
);

-- workspace_invitations
drop policy if exists "inv read admin" on public.workspace_invitations;
create policy "inv read admin" on public.workspace_invitations for select
    using (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role]));
drop policy if exists "inv read by email" on public.workspace_invitations;
-- L'e-mail vient du claim JWT (auth.email()) : une sous-requête sur
-- auth.users s'exécuterait avec les privilèges de l'appelant authenticated,
-- qui n'y a aucun droit (voir migration 20260805150200).
create policy "inv read by email" on public.workspace_invitations for select using (
    auth.uid() is not null
    and lower(email) = lower(coalesce(auth.email(), ''))
    and revoked_at is null and accepted_at is null and expires_at > now()
);
drop policy if exists "inv insert admin" on public.workspace_invitations;
create policy "inv insert admin" on public.workspace_invitations for insert with check (
    public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
    and created_by = auth.uid()
);
drop policy if exists "inv update admin" on public.workspace_invitations;
create policy "inv update admin" on public.workspace_invitations for update
    using (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role]));

-- workspace_api_keys (le client ne SELECT jamais key_hash)
drop policy if exists "ak read admin" on public.workspace_api_keys;
create policy "ak read admin" on public.workspace_api_keys for select
    using (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role]));
drop policy if exists "ak insert admin" on public.workspace_api_keys;
create policy "ak insert admin" on public.workspace_api_keys for insert with check (
    public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
    and created_by = auth.uid()
);
drop policy if exists "ak update admin" on public.workspace_api_keys;
create policy "ak update admin" on public.workspace_api_keys for update
    using (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role]))
    with check (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role]));
drop policy if exists "ak delete owner" on public.workspace_api_keys;
create policy "ak delete owner" on public.workspace_api_keys for delete
    using (public.workspace_role_of(workspace_id) = 'owner');

-- hybrid_nodes
drop policy if exists "hn read members" on public.hybrid_nodes;
create policy "hn read members" on public.hybrid_nodes for select using (public.is_workspace_member(workspace_id));
drop policy if exists "hn insert writers" on public.hybrid_nodes;
create policy "hn insert writers" on public.hybrid_nodes for insert
    with check (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role, 'member'::workspace_role]));
drop policy if exists "hn update writers" on public.hybrid_nodes;
create policy "hn update writers" on public.hybrid_nodes for update
    using (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role, 'member'::workspace_role]))
    with check (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role, 'member'::workspace_role]));
drop policy if exists "hn delete writers" on public.hybrid_nodes;
create policy "hn delete writers" on public.hybrid_nodes for delete
    using (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role, 'member'::workspace_role]));

-- Journaux : lecture membre uniquement. AUCUNE policy d'écriture — seul le
-- service_role (orchestrateur) y écrit.
drop policy if exists "nt read members" on public.node_transitions;
create policy "nt read members" on public.node_transitions for select using (public.is_workspace_member(workspace_id));
drop policy if exists "notif read members" on public.notifications;
create policy "notif read members" on public.notifications for select using (public.is_workspace_member(workspace_id));
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select using (
    exists (select 1 from public.workspace_members m where m.workspace_id = audit_log.workspace_id and m.user_id = auth.uid())
);

-- org_agents : cf. 20260803120100_org_agents_rls.sql (4 policies).

-- ── Droits d'exécution ──────────────────────────────────────────────────────
-- Une expression de policy est évaluée avec les privilèges de L'APPELANT :
-- sans ces GRANT, tout utilisateur connecté reçoit `42501 permission denied
-- for function` au lieu d'un résultat, et la RLS devient inutilisable.
grant execute on function public.is_workspace_member(uuid)        to authenticated;
grant execute on function public.workspace_role_of(uuid)          to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
revoke execute on function public.has_workspace_role(uuid, text[]) from public, anon;

grant execute on function public.create_workspace_api_key(uuid, text)                     to authenticated;
grant execute on function public.invite_workspace_member(uuid, text, workspace_role)      to authenticated;
grant execute on function public.accept_workspace_invitation(text)                        to authenticated;
-- Réservée au serveur : elle lit les empreintes de clés.
revoke execute on function public.verify_workspace_api_key(text) from public, anon, authenticated;
