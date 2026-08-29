-- CRITIQUE : create_workspace_api_key et invite_workspace_member vérifiaient
-- `workspace_role_of(p_workspace_id) NOT IN ('owner','admin')`. Pour un
-- appelant qui n'est pas membre du workspace visé, workspace_role_of()
-- renvoie NULL, et `NULL NOT IN (...)` vaut NULL — un `IF NULL THEN` est
-- traité comme faux en PL/pgSQL : le RAISE EXCEPTION 'forbidden' était
-- silencieusement sauté. Conséquence réelle : n'importe quel utilisateur
-- authentifié pouvait créer une clé API active pour n'importe quel
-- workspace auquel il n'appartient pas (create_workspace_api_key), ou y
-- inviter n'importe qui (invite_workspace_member). COALESCE vers une
-- chaîne vide rend le NOT IN sûr au NULL (jamais NULL, toujours vrai/faux).

CREATE OR REPLACE FUNCTION public.create_workspace_api_key(p_workspace_id uuid, p_name text)
 RETURNS TABLE(id uuid, raw_key text, key_prefix text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
    raw     text;
    prefix  text;
    hashed  text;
    new_id  uuid;
    created timestamptz;
begin
    if coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner','admin') then
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

CREATE OR REPLACE FUNCTION public.invite_workspace_member(p_workspace_id uuid, p_email text, p_role workspace_role DEFAULT 'member'::workspace_role)
 RETURNS TABLE(id uuid, token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
    norm_email text := lower(trim(p_email));
    new_token text;
    new_id uuid;
    new_exp timestamptz;
begin
    if coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner','admin') then
        raise exception 'forbidden';
    end if;

    if norm_email = '' then
        raise exception 'email_required';
    end if;

    if p_role = 'owner' then
        raise exception 'owner_role_not_invitable';
    end if;

    if exists (
        select 1
        from public.workspace_invitations wi
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
        into new_id, new_exp;

    return query select new_id, new_token, new_exp;
end;
$function$;
