-- Audit du 22/10/2026 (Lot 0, tâche 0.2 / M1). État relevé le 23/10 : la vue
-- workspace_members_view est déjà en security_invoker, mais
--   - anon garde SELECT dessus (inutile : la RLS lui rend 0 ligne) ;
--   - seule la policy « profile self read » existe sur profiles : la jointure de la vue
--     rend un e-mail NULL pour tous les autres membres (régression de MembersView).
-- On ouvre la lecture du profil (id, email, display_name, created_at) aux co-membres
-- d'un même workspace, et à eux seuls.

revoke all on public.workspace_members_view from anon;
grant select on public.workspace_members_view to authenticated;

drop policy if exists "profile comember read" on public.profiles;
create policy "profile comember read" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.workspace_members me
      join public.workspace_members other on other.workspace_id = me.workspace_id
      where me.user_id = (select auth.uid())
        and other.user_id = profiles.id
    )
  );

comment on view public.workspace_members_view is
  'Membres + e-mail. security_invoker : soumise à la RLS de workspace_members et profiles (audit 22/10/2026).';

-- Rollback :
-- drop policy if exists "profile comember read" on public.profiles;
-- grant select on public.workspace_members_view to anon;
