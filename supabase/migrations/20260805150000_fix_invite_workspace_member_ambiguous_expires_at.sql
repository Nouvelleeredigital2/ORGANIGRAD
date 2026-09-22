-- Correction : invite_workspace_member échouait systématiquement avec
-- `42702 column reference "expires_at" is ambiguous`. La colonne OUT
-- `expires_at` (RETURNS TABLE) masquait la colonne de
-- workspace_invitations dans le test d'invitation déjà pendante.
-- Le contrat de sortie (id, token, expires_at) est inchangé.
--
-- Idempotente : CREATE OR REPLACE, aucune donnée modifiée.
-- Retour arrière : rejouer la définition antérieure (baseline 2026-08-03,
-- lignes 402-445) — elle réintroduit le bug ; ne l'utiliser qu'en cas de
-- régression fonctionnelle avérée de cette version.

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

    -- Refuse si une invitation pending existe déjà pour cette paire.
    -- Les colonnes sont qualifiées par l'alias `wi` : les colonnes OUT
    -- (id, token, expires_at) sont des variables PL/pgSQL et entreraient
    -- en conflit avec toute référence non qualifiée.
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
