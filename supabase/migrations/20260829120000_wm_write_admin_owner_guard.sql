-- Audit 2026-08-29, constat P1 (Phase 3) : la policy "wm write admin" était
-- déclarée FOR ALL sans protection de la ligne du owner ni restriction sur la
-- valeur du rôle. Les policies permissives se combinant en OR, elle couvrait
-- aussi le DELETE en contournant la clause de protection de "wm delete admin".
-- Conséquence : un admin, via l'API REST directe (hors UI), pouvait
--   (a) rétrograder le rôle du owner,
--   (b) s'attribuer le rôle 'owner' (débloquant p. ex. "ak delete owner"),
--   (c) supprimer la ligne de membership du owner.
--
-- Remplacement par des policies PAR COMMANDE :
--   - INSERT : admin, jamais avec le rôle 'owner' (les insertions légitimes de
--     lignes owner passent par les fonctions SECURITY DEFINER handle_new_user
--     et accept_workspace_invitation, qui ignorent la RLS) ;
--   - UPDATE : admin, jamais sur la ligne du owner, jamais vers le rôle 'owner' ;
--   - DELETE : plus couvert ici — reste régi par "wm delete admin" (protège le
--     owner) et "wm leave self" (un membre peut partir, jamais le owner).

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
