-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — Row Level Security (Priorité 3)
--
-- Cloisonne TOUTES les tables par workspace. Le client SPA se connecte avec la
-- clé anon + le JWT utilisateur : RLS garantit qu'un utilisateur ne voit/écrit
-- QUE les ressources des workspaces dont il est membre, avec le bon rôle.
--
-- L'orchestrateur se connecte en service_role (bypass RLS) ; son cloisonnement
-- repose en plus sur les clauses explicites `where workspace_id = $ws` de chaque
-- requête (défense en profondeur).
--
-- Rôles : owner > admin > member > viewer.
--   - lecture (SELECT)        : tout membre du workspace
--   - écriture des nœuds       : owner / admin / member (pas viewer)
--   - gestion clés & membres   : owner / admin
--   - suppression du workspace : owner
--
-- Idempotente : `drop policy if exists` avant chaque `create policy`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Fonctions d'aide (SECURITY DEFINER, STABLE) ──────────────────────────────
-- Évitent la récursion RLS : elles lisent workspace_members en contournant les
-- policies (definer), donc une policy sur workspace_members peut les appeler.

create or replace function public.is_workspace_member(p_ws uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from public.workspace_members
         where workspace_id = p_ws and user_id = auth.uid()
    );
$$;

create or replace function public.has_workspace_role(p_ws uuid, p_roles text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from public.workspace_members
         where workspace_id = p_ws
           and user_id = auth.uid()
           and role = any(p_roles)
    );
$$;

-- ── Auto-membership du créateur (évite le chicken-egg de workspace_members) ──
create or replace function public.tg_workspace_add_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.owner_id is not null then
        insert into public.workspace_members (workspace_id, user_id, role)
        values (new.id, new.owner_id, 'owner')
        on conflict (workspace_id, user_id) do nothing;
    end if;
    return new;
end;
$$;

drop trigger if exists workspace_add_owner on public.workspaces;
create trigger workspace_add_owner
    after insert on public.workspaces
    for each row execute function public.tg_workspace_add_owner();

-- ── Activation RLS ───────────────────────────────────────────────────────────
alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.workspace_api_keys  enable row level security;
alter table public.hybrid_nodes        enable row level security;
alter table public.node_transitions    enable row level security;
alter table public.notifications       enable row level security;

-- ── workspaces ───────────────────────────────────────────────────────────────
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
    for select using (public.is_workspace_member(id));

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
    for insert with check (owner_id = auth.uid());

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
    for update using (public.has_workspace_role(id, array['owner', 'admin']))
    with check (public.has_workspace_role(id, array['owner', 'admin']));

drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces
    for delete using (public.has_workspace_role(id, array['owner']));

-- ── workspace_members ─────────────────────────────────────────────────────────
drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
    for select using (public.is_workspace_member(workspace_id));

drop policy if exists members_write on public.workspace_members;
create policy members_write on public.workspace_members
    for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
    with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ── workspace_api_keys (jamais de key_hash exposé au client : RLS limite les
--    lignes ; le SPA ne SELECT pas la colonne key_hash) ────────────────────────
drop policy if exists api_keys_admin on public.workspace_api_keys;
create policy api_keys_admin on public.workspace_api_keys
    for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
    with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ── hybrid_nodes ──────────────────────────────────────────────────────────────
drop policy if exists nodes_select on public.hybrid_nodes;
create policy nodes_select on public.hybrid_nodes
    for select using (public.is_workspace_member(workspace_id));

drop policy if exists nodes_write on public.hybrid_nodes;
create policy nodes_write on public.hybrid_nodes
    for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']))
    with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- ── node_transitions (journal immuable : lecture membre, insert éditeur) ──────
drop policy if exists transitions_select on public.node_transitions;
create policy transitions_select on public.node_transitions
    for select using (public.is_workspace_member(workspace_id));

drop policy if exists transitions_insert on public.node_transitions;
create policy transitions_insert on public.node_transitions
    for insert with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- ── notifications (audit : lecture membre, insert éditeur) ────────────────────
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
    for select using (public.is_workspace_member(workspace_id));

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
    for insert with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- ── Rollback (manuel) ────────────────────────────────────────────────────────
-- alter table ... disable row level security;  (pour chaque table)
-- drop trigger if exists workspace_add_owner on public.workspaces;
-- drop function if exists public.tg_workspace_add_owner();
-- drop function if exists public.has_workspace_role(uuid, text[]);
-- drop function if exists public.is_workspace_member(uuid);
