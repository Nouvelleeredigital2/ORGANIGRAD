-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — schéma de base (reconstruit)
--
-- Ce dépôt ne versionnait AUCUNE migration : le schéma n'existait qu'implicitement
-- dans les requêtes SQL de l'orchestrateur et du frontend. Cette migration
-- reconstruit fidèlement les tables et y ajoute le MODÈLE DE SCOPES + l'expiration
-- des clés API (Priorité 2).
--
-- Idempotente : `create table if not exists` + `alter table ... add column if not
-- exists` afin de pouvoir l'appliquer aussi bien sur une base vierge que sur la
-- base de production existante (qui possède déjà les tables sans scopes).
--
-- Rollback : voir le bloc commenté en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto"; -- gen_random_uuid(), digest()

-- ── Workspaces ───────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    owner_id    uuid references auth.users (id) on delete set null,
    created_at  timestamptz not null default now()
);

-- ── Membres d'un workspace (rôles humains) ───────────────────────────────────
create table if not exists public.workspace_members (
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    user_id      uuid not null references auth.users (id) on delete cascade,
    role         text not null default 'member'
                 check (role in ('owner', 'admin', 'member', 'viewer')),
    created_at   timestamptz not null default now(),
    primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx
    on public.workspace_members (user_id);

-- ── Clés API workspace (agents / services techniques) ────────────────────────
-- Le token complet n'est JAMAIS stocké : seul son hash SHA-256 l'est. Le préfixe
-- (key_prefix) sert à l'affichage. La valeur complète n'est visible qu'à la
-- création (RPC ci-dessous).
create table if not exists public.workspace_api_keys (
    id           uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    name         text not null,
    key_prefix   text not null,
    key_hash     text not null,
    scopes       text[] not null default array[]::text[],
    created_by   uuid references auth.users (id) on delete set null,
    created_at   timestamptz not null default now(),
    last_used_at timestamptz,
    expires_at   timestamptz,
    revoked_at   timestamptz
);

-- Colonnes ajoutées sur une base PRÉ-EXISTANTE (no-op si déjà présentes).
alter table public.workspace_api_keys
    add column if not exists scopes     text[] not null default array[]::text[];
alter table public.workspace_api_keys
    add column if not exists expires_at timestamptz;
alter table public.workspace_api_keys
    add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Le hash est unique : un même token ne peut pas exister deux fois.
create unique index if not exists workspace_api_keys_hash_uniq
    on public.workspace_api_keys (key_hash);
create index if not exists workspace_api_keys_workspace_idx
    on public.workspace_api_keys (workspace_id);

-- Scopes reconnus (référence — la validation applicative vit dans
-- orchestrator/src/api/scopes.ts). Stockés en text[] pour rester souples.
--   graph:read · node:read · node:run · execution:read
--   human:approve · human:reject · node:reset · workspace:admin
comment on column public.workspace_api_keys.scopes is
    'Scopes accordés. Une clé technique NE DOIT PAS recevoir human:approve / human:reject / node:reset par défaut.';

-- ── Nœuds hybrides (organigramme exécutable) ─────────────────────────────────
create table if not exists public.hybrid_nodes (
    id                    uuid primary key default gen_random_uuid(),
    workspace_id          uuid not null references public.workspaces (id) on delete cascade,
    type                  text not null check (type in ('HUMAN', 'AGENT_IA', 'SOFTWARE_MCP')),
    nom                   text not null,
    role_titre            text not null default '',
    parent_id             uuid references public.hybrid_nodes (id) on delete set null,
    grade_id              text not null default '',
    system_prompt         text,
    skills                text[] not null default array[]::text[],
    mcp_config            jsonb,
    notification_channels jsonb,
    avatar_url            text,
    status                text not null default 'IDLE'
                          check (status in ('IDLE', 'EXECUTING', 'CONTROL_PENDING_IA',
                                            'WAITING_HUMAN_APPROVAL', 'ERROR')),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);
create index if not exists hybrid_nodes_workspace_idx
    on public.hybrid_nodes (workspace_id);
create index if not exists hybrid_nodes_parent_idx
    on public.hybrid_nodes (parent_id);

-- ── Journal des transitions (audit + alimentation SSE) ───────────────────────
create table if not exists public.node_transitions (
    id           bigint generated always as identity primary key,
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    node_id      uuid not null,
    from_status  text not null,
    to_status    text not null,
    payload      jsonb,
    actor_kind   text not null default 'orchestrator'
                 check (actor_kind in ('user', 'api_key', 'orchestrator')),
    actor_id     text,
    created_at   timestamptz not null default now()
);
create index if not exists node_transitions_ws_created_idx
    on public.node_transitions (workspace_id, created_at);
create index if not exists node_transitions_node_idx
    on public.node_transitions (node_id);

-- ── Audit des notifications sortantes ────────────────────────────────────────
create table if not exists public.notifications (
    id           bigint generated always as identity primary key,
    workspace_id uuid not null references public.workspaces (id) on delete cascade,
    node_id      uuid,
    channel      text not null check (channel in ('slack_webhook', 'email', 'whatsapp')),
    target       text not null,
    message      text not null,
    status       text not null check (status in ('sent', 'failed')),
    error        text,
    sent_at      timestamptz,
    created_at   timestamptz not null default now()
);
create index if not exists notifications_ws_created_idx
    on public.notifications (workspace_id, created_at);

-- ── RPC de création de clé API (renvoie le token en clair UNE SEULE FOIS) ─────
-- SECURITY DEFINER : exécutée avec les droits du propriétaire pour insérer le
-- hash, mais vérifie que l'appelant est admin/owner du workspace ciblé.
create or replace function public.create_workspace_api_key(
    p_workspace_id uuid,
    p_name         text,
    p_scopes       text[] default array['graph:read', 'node:read', 'node:run', 'execution:read']::text[],
    p_expires_at   timestamptz default null
)
returns table (id uuid, raw_key text, key_prefix text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_raw    text;
    v_prefix text;
    v_hash   text;
    v_id     uuid;
    v_caller uuid := auth.uid();
begin
    -- Seuls owner/admin du workspace peuvent créer une clé.
    if not exists (
        select 1 from public.workspace_members m
         where m.workspace_id = p_workspace_id
           and m.user_id = v_caller
           and m.role in ('owner', 'admin')
    ) then
        raise exception 'forbidden: caller is not an admin of this workspace';
    end if;

    -- Une clé technique ne reçoit JAMAIS les scopes de validation humaine.
    if p_scopes && array['human:approve', 'human:reject', 'node:reset', 'workspace:admin']::text[] then
        raise exception 'forbidden: human/admin scopes cannot be granted to an API key';
    end if;

    v_raw    := 'ok_' || encode(gen_random_bytes(24), 'hex');
    v_prefix := left(v_raw, 11);
    v_hash   := encode(digest(v_raw, 'sha256'), 'hex');

    insert into public.workspace_api_keys
        (workspace_id, name, key_prefix, key_hash, scopes, created_by, expires_at)
    values
        (p_workspace_id, p_name, v_prefix, v_hash, p_scopes, v_caller, p_expires_at)
    returning workspace_api_keys.id into v_id;

    return query select v_id, v_raw, v_prefix;
end;
$$;

-- ── Rollback (manuel) ────────────────────────────────────────────────────────
-- drop function if exists public.create_workspace_api_key(uuid, text, text[], timestamptz);
-- drop table if exists public.notifications;
-- drop table if exists public.node_transitions;
-- drop table if exists public.hybrid_nodes;
-- drop table if exists public.workspace_api_keys;
-- drop table if exists public.workspace_members;
-- drop table if exists public.workspaces;
