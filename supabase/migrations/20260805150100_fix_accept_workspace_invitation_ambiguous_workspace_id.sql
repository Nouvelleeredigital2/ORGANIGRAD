-- Correction : accept_workspace_invitation échouait systématiquement avec
-- `42702 column reference "workspace_id" is ambiguous`. Les colonnes OUT
-- (workspace_id, role) sont des variables PL/pgSQL, et la liste de colonnes
-- de `on conflict (workspace_id, user_id)` passe par la résolution de
-- variables. Le pragma `#variable_conflict use_column` force la résolution
-- côté colonne ; aucune référence de la fonction ne requiert la résolution
-- côté variable (les variables sont p_token, inv.*, user_email — sans
-- homonyme de colonne dans les requêtes concernées).
-- Le contrat de sortie (workspace_id, role) est inchangé.
--
-- Idempotente : CREATE OR REPLACE, aucune donnée modifiée.
-- Retour arrière : rejouer la définition antérieure (baseline 2026-08-03,
-- lignes 447-488) — elle réintroduit le bug ; ne l'utiliser qu'en cas de
-- régression fonctionnelle avérée de cette version.

create or replace function public.accept_workspace_invitation(p_token text)
returns table(workspace_id uuid, role workspace_role)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
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
