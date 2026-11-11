-- =============================================================================
-- Organigrad — retrait du jeu de démo du compte de test nouvelleeredigital@gmail.com
-- Base : xucmfdggetwxmpquqjvj (production). Pendant de demo-compte-test.sql.
--
-- Ne retire que la démo, par marqueur, dans le seul workspace propre du compte :
--   * org_agents : source_kind = 'import' et source_ref = 'demo-ct.csv'.
--     Sous l'identité du compte (policy org_agents_delete : owner/admin). Les
--     rattachements sont coupés d'abord : le trigger BEFORE DELETE
--     org_agents_reparent_children refuse une suppression de masse d'une
--     hiérarchie (27000), même ordre que agentRepo.clearWorkspace.
--   * projects dc0e0000-…-00000000000{1,2,3} et leurs project_tasks (cascade).
--     EN POSTGRES : projects et project_tasks n'ont volontairement ni droit
--     DELETE ni policy DELETE pour authenticated (l'application archive).
--     Le DELETE est borné au workspace du compte et aux trois identifiants fixes.
--     Les tâches ajoutées à la main par le compte dans ces projets partent aussi.
--     Si un circuit, un grant ou une délégation référence un de ces projets
--     (FK sans cascade), le bloc échoue en entier : rien n'est retiré.
--   * profiles : la démo ne le modifie pas ; rien à remettre à l'état neuf.
-- Rejouable : sort avec un NOTICE s'il n'y a rien à retirer.
-- =============================================================================
do $$
declare
    v_email   constant text := 'nouvelleeredigital@gmail.com';
    v_source  constant text := 'demo-ct.csv';
    v_p1      constant uuid := 'dc0e0000-0000-4000-8000-000000000001';
    v_p2      constant uuid := 'dc0e0000-0000-4000-8000-000000000002';
    v_p3      constant uuid := 'dc0e0000-0000-4000-8000-000000000003';
    v_user    uuid;
    v_ws      uuid;
    v_n       int;
    v_agents  int;
    v_tasks   int;
    v_projets int;
    v_autres_avant jsonb;
    v_autres_apres jsonb;
    v_releve  jsonb;
begin
    select id into v_user from auth.users where lower(email) = v_email;
    if v_user is null then
        raise exception 'compte de test % introuvable', v_email;
    end if;

    select count(*) into v_n
      from public.workspaces w
      join public.workspace_members m on m.workspace_id = w.id and m.user_id = v_user and m.role::text = 'owner'
     where w.owner_id = v_user;
    if v_n <> 1 then
        raise exception 'attendu 1 workspace propre au compte de test, trouvé %', v_n;
    end if;
    select w.id into v_ws
      from public.workspaces w
      join public.workspace_members m on m.workspace_id = w.id and m.user_id = v_user and m.role::text = 'owner'
     where w.owner_id = v_user;

    -- Les identifiants fixes ne doivent exister nulle part ailleurs.
    if exists (select 1 from public.projects where id in (v_p1, v_p2, v_p3) and workspace_id <> v_ws) then
        raise exception 'un projet dc0e0000-… existe hors du workspace % : arrêt', v_ws;
    end if;

    if not exists (select 1 from public.org_agents where workspace_id = v_ws and source_kind = 'import' and source_ref = v_source)
       and not exists (select 1 from public.projects where id in (v_p1, v_p2, v_p3)) then
        raise notice 'aucune démo à retirer pour % (workspace %)', v_email, v_ws;
        return;
    end if;

    select jsonb_build_object(
        'org_agents',    (select count(*) from public.org_agents    where workspace_id <> v_ws),
        'projects',      (select count(*) from public.projects      where workspace_id <> v_ws),
        'project_tasks', (select count(*) from public.project_tasks where workspace_id <> v_ws))
      into v_autres_avant;

    -- 1. Fiches RH, sous l'identité du compte.
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_user, 'role', 'authenticated', 'email', v_email)::text, true);
    execute 'set local role authenticated';

    -- Une fiche hors démo rattachée à une fiche démo perdrait son rattachement :
    -- on le signale plutôt que de le décider.
    if exists (select 1 from public.org_agents o
                 join public.org_agents p on p.id = o.rattachement_id
                where o.workspace_id = v_ws and p.workspace_id = v_ws
                  and p.source_kind = 'import' and p.source_ref = v_source
                  and not (o.source_kind = 'import' and o.source_ref = v_source)) then
        raise exception 'des fiches hors démo sont rattachées à la démo : arrêt, à trancher à la main';
    end if;

    update public.org_agents set rattachement_id = null
     where workspace_id = v_ws and source_kind = 'import' and source_ref = v_source
       and rattachement_id is not null;
    delete from public.org_agents
     where workspace_id = v_ws and source_kind = 'import' and source_ref = v_source;
    get diagnostics v_agents = row_count;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    -- 2. Projets et tâches, en postgres (aucun DELETE accordé à authenticated).
    select count(*) into v_tasks from public.project_tasks
     where workspace_id = v_ws and project_id in (v_p1, v_p2, v_p3);
    delete from public.projects
     where workspace_id = v_ws and id in (v_p1, v_p2, v_p3);
    get diagnostics v_projets = row_count;

    select jsonb_build_object(
        'org_agents',    (select count(*) from public.org_agents    where workspace_id <> v_ws),
        'projects',      (select count(*) from public.projects      where workspace_id <> v_ws),
        'project_tasks', (select count(*) from public.project_tasks where workspace_id <> v_ws))
      into v_autres_apres;
    if v_autres_apres <> v_autres_avant then
        raise exception 'autres workspaces modifiés : avant % après %', v_autres_avant, v_autres_apres;
    end if;

    v_releve := jsonb_build_object(
        'workspace', v_ws,
        'org_agents_retires', v_agents,
        'projects_retires', v_projets,
        'project_tasks_retirees', v_tasks,
        'restant_demo', jsonb_build_object(
            'org_agents', (select count(*) from public.org_agents where workspace_id = v_ws and source_kind = 'import' and source_ref = v_source),
            'projects',   (select count(*) from public.projects where id in (v_p1, v_p2, v_p3)),
            'tasks',      (select count(*) from public.project_tasks where project_id in (v_p1, v_p2, v_p3))),
        'autres_workspaces', v_autres_apres);

    raise notice 'demo-ct retirée : %', v_releve;
end
$$;
