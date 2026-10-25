-- Audit du 22/10/2026 (Lot 0, tâche 0.3 / M2) : un admin pouvait créer (REST direct) une
-- invitation role='owner' à sa propre adresse puis l'accepter : accept_workspace_invitation
-- faisait `on conflict do update set role = excluded.role`, donc auto-promotion. La même
-- clause permettait aussi de changer le rôle d'un membre existant, propriétaire compris.
-- Au 23/10 : 8 invitations, aucune en owner.

-- 1. Contrainte de données
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_invitations_role_not_owner'
      and conrelid = 'public.workspace_invitations'::regclass
  ) then
    alter table public.workspace_invitations
      add constraint workspace_invitations_role_not_owner
      check (role <> 'owner'::workspace_role) not valid;
  end if;
end $$;
alter table public.workspace_invitations validate constraint workspace_invitations_role_not_owner;
comment on constraint workspace_invitations_role_not_owner on public.workspace_invitations is
  'Le rôle owner ne s''attribue jamais par invitation (audit 22/10/2026).';

-- 2. Policies : même règle côté RLS (défense en profondeur)
drop policy if exists "inv insert admin" on public.workspace_invitations;
create policy "inv insert admin" on public.workspace_invitations
  for insert to authenticated
  with check (
    public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
    and created_by = (select auth.uid())
    and role <> 'owner'::workspace_role
  );

drop policy if exists "inv update admin" on public.workspace_invitations;
create policy "inv update admin" on public.workspace_invitations
  for update to authenticated
  using (public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role]))
  with check (
    public.workspace_role_of(workspace_id) = any (array['owner'::workspace_role, 'admin'::workspace_role])
    and role <> 'owner'::workspace_role
  );

-- 3. Accepter une invitation ne change jamais le rôle d'un membre déjà présent.
--    Définition reprise à l'identique de la base (23/10), seule la clause on conflict change.
create or replace function public.accept_workspace_invitation(p_token text)
 returns table(workspace_id uuid, role workspace_role)
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
#variable_conflict use_column
declare
    inv record;
    user_email text;
begin
    if auth.uid() is null then
        raise exception 'unauthenticated';
    end if;

    select email into user_email
    from auth.users
    where id = auth.uid();

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
    on conflict (workspace_id, user_id)
    do nothing;

    update public.workspace_invitations
    set accepted_at = now(), accepted_by = auth.uid()
    where id = inv.id;

    return query select inv.workspace_id, inv.role;
end;
$function$;

-- Rollback : supprimer la contrainte, recréer les deux policies sans `role <> 'owner'`,
-- et restaurer `do update set role = excluded.role` (migration 20260805150100).
