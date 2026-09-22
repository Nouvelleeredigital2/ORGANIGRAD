-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — import transactionnel de fiches RH
--
-- `supabase-js` ne sait pas ouvrir une transaction couvrant plusieurs requêtes :
-- un import en plusieurs appels laisserait l'organigramme dans un état
-- intermédiaire si l'un d'eux échouait. D'où cette fonction.
--
-- SECURITY INVOKER (défaut, déclaré explicitement) : la RLS de `org_agents`
-- s'applique pleinement. La fonction n'accorde AUCUN privilège supplémentaire —
-- un `viewer` qui l'appelle sera rejeté par les policies.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.import_org_agents(
    p_workspace_id uuid,
    p_source_kind  text,
    p_source_ref   text,
    p_agents       jsonb,
    p_mode         text default 'merge'   -- 'merge' | 'replace'
)
returns table (inserted int, updated int, deleted int)
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_avant   int;
    v_apres   int;
    v_touched int;
    v_deleted int := 0;
begin
    if p_mode not in ('merge', 'replace') then
        raise exception 'mode invalide : % (attendu merge|replace)', p_mode
            using errcode = '22023';
    end if;
    if p_source_kind not in ('import', 'remote_csv', 'manual') then
        raise exception 'source_kind invalide : %', p_source_kind
            using errcode = '22023';
    end if;

    select count(*) into v_avant
      from public.org_agents
     where workspace_id = p_workspace_id
       and source_kind  = p_source_kind
       and source_ref   = p_source_ref;

    -- ── Passe 1 : upsert SANS rattachement ──────────────────────────────────
    -- Le rattachement est résolu en passe 3 : à ce stade, le supérieur d'une
    -- ligne n'est pas forcément déjà inséré.
    with charge as (
        select
            a->>'external_key' as external_key,
            coalesce(a->>'nom', '')        as nom,
            coalesce(a->>'prenom', '')     as prenom,
            coalesce(a->>'fonction', '')   as fonction,
            coalesce(a->>'titre', '')      as titre,
            coalesce(a->>'service', '')    as service,
            coalesce(a->>'pole', '')       as pole,
            coalesce(a->>'grade_style', 'Agent') as grade_style,
            coalesce(a->>'type_temps', 'Complet') as type_temps,
            a->>'nbi'        as nbi,
            a->>'avatar_url' as avatar_url,
            a->>'email'      as email,
            a->>'phone'      as phone
        from jsonb_array_elements(p_agents) as a
        where nullif(a->>'external_key', '') is not null
    )
    insert into public.org_agents (
        workspace_id, source_kind, source_ref, external_key,
        nom, prenom, fonction, titre, service, pole,
        grade_style, type_temps, nbi, avatar_url, email, phone,
        rattachement_id
    )
    select
        p_workspace_id, p_source_kind, p_source_ref, c.external_key,
        c.nom, c.prenom, c.fonction, c.titre, c.service, c.pole,
        c.grade_style, c.type_temps, c.nbi, c.avatar_url, c.email, c.phone,
        null
    from charge c
    on conflict (workspace_id, source_kind, source_ref, external_key) do update set
        nom         = excluded.nom,
        prenom      = excluded.prenom,
        fonction    = excluded.fonction,
        titre       = excluded.titre,
        service     = excluded.service,
        pole        = excluded.pole,
        grade_style = excluded.grade_style,
        type_temps  = excluded.type_temps,
        nbi         = excluded.nbi,
        avatar_url  = excluded.avatar_url,
        email       = excluded.email,
        phone       = excluded.phone;

    get diagnostics v_touched = row_count;

    -- ── Passe 2 : en mode `replace`, retirer les absents de la charge ───────
    -- Exécutée AVANT la résolution des rattachements : la population encore
    -- concernée a `rattachement_id` à null, donc le trigger de reparentage
    -- n'a aucun effet de bord ici.
    if p_mode = 'replace' then
        delete from public.org_agents o
         where o.workspace_id = p_workspace_id
           and o.source_kind  = p_source_kind
           and o.source_ref   = p_source_ref
           and not exists (
               select 1
                 from jsonb_array_elements(p_agents) as a
                where a->>'external_key' = o.external_key
           );
        get diagnostics v_deleted = row_count;
    end if;

    -- ── Passe 3 : résolution des rattachements ──────────────────────────────
    update public.org_agents o
       set rattachement_id = parent.id
      from jsonb_array_elements(p_agents) as a
      join public.org_agents parent
        on parent.workspace_id = p_workspace_id
       and parent.source_kind  = p_source_kind
       and parent.source_ref   = p_source_ref
       and parent.external_key = a->>'rattachement_external_key'
     where o.workspace_id = p_workspace_id
       and o.source_kind  = p_source_kind
       and o.source_ref   = p_source_ref
       and o.external_key = a->>'external_key'
       and nullif(a->>'rattachement_external_key', '') is not null;

    select count(*) into v_apres
      from public.org_agents
     where workspace_id = p_workspace_id
       and source_kind  = p_source_kind
       and source_ref   = p_source_ref;

    inserted := greatest(0, v_apres - (v_avant - v_deleted));
    updated  := greatest(0, v_touched - inserted);
    deleted  := v_deleted;
    return next;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Retour arrière :
-- drop function if exists public.import_org_agents(uuid, text, text, jsonb, text);
-- ────────────────────────────────────────────────────────────────────────────
