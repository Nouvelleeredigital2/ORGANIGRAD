-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — RLS sur `org_agents`
--
-- Réutilise les fonctions SECURITY DEFINER posées par 20260617130000_rls.sql
-- (`is_workspace_member`, `has_workspace_role`).
--
-- Écriture volontairement plus fine que `nodes_write` : le DELETE est réservé à
-- owner/admin. Supprimer une fiche RH n'est pas une simple édition — cela
-- reparente les subordonnés du supprimé (cf. trigger de reparentage). Un
-- `member` corrige un téléphone ; un `admin` retire quelqu'un de l'organigramme.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.org_agents enable row level security;

-- Lecture : tout membre du workspace, y compris `viewer`.
drop policy if exists org_agents_select on public.org_agents;
create policy org_agents_select on public.org_agents
    for select using (public.is_workspace_member(workspace_id));

drop policy if exists org_agents_insert on public.org_agents;
create policy org_agents_insert on public.org_agents
    for insert with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

drop policy if exists org_agents_update on public.org_agents;
create policy org_agents_update on public.org_agents
    for update using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']))
    with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

-- Suppression : owner/admin seulement (effet de bord hiérarchique).
drop policy if exists org_agents_delete on public.org_agents;
create policy org_agents_delete on public.org_agents
    for delete using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ────────────────────────────────────────────────────────────────────────────
-- Retour arrière :
--
-- drop policy if exists org_agents_delete on public.org_agents;
-- drop policy if exists org_agents_update on public.org_agents;
-- drop policy if exists org_agents_insert on public.org_agents;
-- drop policy if exists org_agents_select on public.org_agents;
-- alter table public.org_agents disable row level security;
-- ────────────────────────────────────────────────────────────────────────────
