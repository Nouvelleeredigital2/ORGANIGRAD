-- =============================================================================
-- Organigrad — jeu de démo du compte de test nouvelleeredigital@gmail.com
-- Base : xucmfdggetwxmpquqjvj (production). À coller tel quel dans l'éditeur SQL.
--
-- CE QUE LE SCRIPT POSE (dans le seul workspace propre du compte, créé à
-- l'inscription par le trigger handle_new_user : « nouvelleeredigital workspace »)
--   * org_agents    : 15 fiches RH d'une commune fictive (« Mairie de Valbrune »),
--                     4 pôles, hiérarchie complète, via la RPC de l'application
--                     public.import_org_agents (chemin de l'import CSV/XLSX),
--                     source_kind = 'import', source_ref = 'demo-ct.csv' (marqueur).
--   * projects      : 3 projets RH/organisation, identifiants fixes dc0e0000-…-00000000000N.
--   * project_tasks : 12 tâches (todo / running / blocked / done), échéances
--                     relatives à la date du jour, certaines assignées au compte.
--   Toutes les écritures passent SOUS L'IDENTITÉ DU COMPTE (rôle authenticated +
--   claims) : RLS, gardes de version et contrôle « assignee membre » s'appliquent.
--
-- CE QUI N'EST VOLONTAIREMENT PAS SEMÉ (Organigrad décide ; rien d'exécutable)
--   * hybrid_nodes : le graphe hybride est exécutable. Un owner/member peut lancer
--     /api/nodes/:id/run et run-flow avec sa session ; le moteur appelle alors MCP
--     (AGENT_IA / SOFTWARE_MCP) ou fige un nœud HUMAN en attente et émet
--     validation.requested vers Synapse. Écran Orchestration / Validations vide.
--   * bot_profiles, team_circuits, circuit_* (exécutions, grants, curseurs,
--     occurrences, tentatives, reçus), project_service_delegations, clés
--     workspace_api_keys, personal_project_tokens, synapse_project_* : surfaces
--     lues par l'orchestrateur, le planificateur de circuits, Hermès ou Synapse.
--   * notifications, node_transitions, audit_log : écrites par l'orchestrateur
--     seul (aucune policy d'écriture navigateur) ; notifications alimente l'envoi
--     e-mail (Edge Function notify-email) et Slack.
--   * workspace_invitations / membres : une invitation produit un lien et un e-mail.
--   * profiles : non modifié.
--
-- Aucun trigger des tables semées n'appelle l'extérieur (pas de pg_net ni pg_cron
-- sur la base ; triggers = gardes et horodatage). org_agents, projects et
-- project_tasks ne sont pas dans la publication Realtime.
-- Lecteurs de projects / project_tasks côté serveur (origin/master relu) : routes
-- GET /api/projects et /context (à la demande, réponse JSON), session de projet
-- privé (exige un personal_project_token), circuits (exigent un team_circuit).
-- Aucun rappel d'échéance, digest, notification d'assignation ni synchro Synapse :
-- échéances et assignations semées ne déclenchent aucun envoi.
--
-- Rejouable : sort avec un NOTICE si le marqueur est déjà présent.
-- Retrait : supabase/scripts/demo-compte-test-retrait.sql
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
    v_autres_avant jsonb;
    v_autres_apres jsonb;
    v_import  jsonb;
    v_releve  jsonb;
begin
    -- 1. Compte et workspace propre --------------------------------------------
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

    -- Le workspace ne doit contenir que le compte de test : aucun autre compte touché.
    if exists (select 1 from public.workspace_members where workspace_id = v_ws and user_id <> v_user) then
        raise exception 'le workspace % a d''autres membres : arrêt', v_ws;
    end if;

    -- 2. Rejouabilité -------------------------------------------------------------
    if exists (select 1 from public.org_agents where workspace_id = v_ws and source_kind = 'import' and source_ref = v_source)
       or exists (select 1 from public.projects where id in (v_p1, v_p2, v_p3)) then
        raise notice 'démo déjà présente pour % (workspace %) : rien à faire', v_email, v_ws;
        return;
    end if;

    -- Témoin : lignes des AUTRES workspaces, avant/après.
    select jsonb_build_object(
        'org_agents',    (select count(*) from public.org_agents    where workspace_id <> v_ws),
        'projects',      (select count(*) from public.projects      where workspace_id <> v_ws),
        'project_tasks', (select count(*) from public.project_tasks where workspace_id <> v_ws))
      into v_autres_avant;

    -- 3. Écritures sous l'identité du compte ------------------------------------
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_user, 'role', 'authenticated', 'email', v_email)::text, true);
    execute 'set local role authenticated';

    -- 3a. Organigramme RH : même RPC que l'import de fichier de l'application.
    select to_jsonb(r) into v_import
      from public.import_org_agents(
        v_ws, 'import', v_source,
        jsonb_build_array(
          jsonb_build_object('external_key','demo-ct-01','prenom','Claire','nom','Moreau','fonction','Directrice générale des services','titre','Attachée territoriale hors classe','service','Direction générale','pole','Direction générale','grade_style','Direction','type_temps','Complet','nbi','25','email','claire.moreau@valbrune-demo.invalid','phone','01 99 00 10 01','rattachement_external_key',null),
          jsonb_build_object('external_key','demo-ct-02','prenom','Sophie','nom','Bernard','fonction','Assistante de direction','titre','Rédactrice principale','service','Secrétariat général','pole','Direction générale','grade_style','Support','type_temps','Complet','nbi','10','email','sophie.bernard@valbrune-demo.invalid','phone','01 99 00 10 02','rattachement_external_key','demo-ct-01'),
          jsonb_build_object('external_key','demo-ct-03','prenom','Julien','nom','Petit','fonction','Responsable du pôle Ressources','titre','Attaché territorial principal','service','Pôle Ressources','pole','Ressources','grade_style','Responsable','type_temps','Complet','nbi','20','email','julien.petit@valbrune-demo.invalid','phone','01 99 00 20 01','rattachement_external_key','demo-ct-01'),
          jsonb_build_object('external_key','demo-ct-04','prenom','Nadia','nom','Haddad','fonction','Gestionnaire carrières et formation','titre','Rédactrice','service','Ressources humaines','pole','Ressources','grade_style','Expert','type_temps','Complet','nbi','15','email','nadia.haddad@valbrune-demo.invalid','phone','01 99 00 20 02','rattachement_external_key','demo-ct-03'),
          jsonb_build_object('external_key','demo-ct-05','prenom','Thomas','nom','Lefèvre','fonction','Gestionnaire paie','titre','Adjoint administratif principal','service','Ressources humaines','pole','Ressources','grade_style','Agent','type_temps','Non complet','email','thomas.lefevre@valbrune-demo.invalid','phone','01 99 00 20 03','rattachement_external_key','demo-ct-04'),
          jsonb_build_object('external_key','demo-ct-06','prenom','Élodie','nom','Garnier','fonction','Responsable finances et commande publique','titre','Attachée territoriale','service','Finances et commande publique','pole','Ressources','grade_style','Expert','type_temps','Complet','nbi','15','email','elodie.garnier@valbrune-demo.invalid','phone','01 99 00 20 04','rattachement_external_key','demo-ct-03'),
          jsonb_build_object('external_key','demo-ct-07','prenom','Karim','nom','Benali','fonction','Responsable du pôle Services à la population','titre','Attaché territorial','service','Pôle Services à la population','pole','Services à la population','grade_style','Responsable','type_temps','Complet','nbi','20','email','karim.benali@valbrune-demo.invalid','phone','01 99 00 30 01','rattachement_external_key','demo-ct-01'),
          jsonb_build_object('external_key','demo-ct-08','prenom','Marie','nom','Lambert','fonction','Officière d''état civil','titre','Adjointe administrative principale','service','État civil – Élections','pole','Services à la population','grade_style','Agent','type_temps','Complet','nbi','10','email','marie.lambert@valbrune-demo.invalid','phone','01 99 00 30 02','rattachement_external_key','demo-ct-07'),
          jsonb_build_object('external_key','demo-ct-09','prenom','Camille','nom','Rousseau','fonction','Coordinatrice enfance-jeunesse','titre','Animatrice principale','service','Enfance – Jeunesse','pole','Services à la population','grade_style','Expert','type_temps','Complet','email','camille.rousseau@valbrune-demo.invalid','phone','01 99 00 30 03','rattachement_external_key','demo-ct-07'),
          jsonb_build_object('external_key','demo-ct-10','prenom','Lucas','nom','Fontaine','fonction','Animateur périscolaire','titre','Adjoint d''animation','service','Enfance – Jeunesse','pole','Services à la population','grade_style','Agent','type_temps','Non complet','email','lucas.fontaine@valbrune-demo.invalid','phone','01 99 00 30 04','rattachement_external_key','demo-ct-09'),
          jsonb_build_object('external_key','demo-ct-11','prenom','Léa','nom','Martin','fonction','Agente d''accueil – guichet unique','titre','Adjointe administrative','service','Accueil – Guichet unique','pole','Services à la population','grade_style','Support','type_temps','Non complet','email','lea.martin@valbrune-demo.invalid','phone','01 99 00 30 05','rattachement_external_key','demo-ct-07'),
          jsonb_build_object('external_key','demo-ct-12','prenom','Philippe','nom','Girard','fonction','Directeur des services techniques','titre','Ingénieur territorial principal','service','Pôle Services techniques','pole','Services techniques','grade_style','Responsable','type_temps','Complet','nbi','20','email','philippe.girard@valbrune-demo.invalid','phone','01 99 00 40 01','rattachement_external_key','demo-ct-01'),
          jsonb_build_object('external_key','demo-ct-13','prenom','Antoine','nom','Mercier','fonction','Chef d''équipe voirie et espaces verts','titre','Agent de maîtrise principal','service','Voirie – Espaces verts','pole','Services techniques','grade_style','Expert','type_temps','Complet','email','antoine.mercier@valbrune-demo.invalid','phone','01 99 00 40 02','rattachement_external_key','demo-ct-12'),
          jsonb_build_object('external_key','demo-ct-14','prenom','Hugo','nom','Dupont','fonction','Agent d''entretien des espaces verts','titre','Adjoint technique','service','Voirie – Espaces verts','pole','Services techniques','grade_style','Agent','type_temps','Complet','email','hugo.dupont@valbrune-demo.invalid','phone','01 99 00 40 03','rattachement_external_key','demo-ct-13'),
          jsonb_build_object('external_key','demo-ct-15','prenom','Samia','nom','Ouali','fonction','Technicienne bâtiments communaux','titre','Technicienne territoriale','service','Bâtiments communaux','pole','Services techniques','grade_style','Expert','type_temps','Complet','email','samia.ouali@valbrune-demo.invalid','phone','01 99 00 40 04','rattachement_external_key','demo-ct-12')
        ),
        'merge', null) r;

    -- 3b. Projets (les gardes posent version = 1 et les horodatages).
    insert into public.projects (id, workspace_id, name, description) values
      (v_p1, v_ws, 'Plan de formation 2027',
       'Recenser les besoins, arbitrer les priorités avec l''encadrement et présenter le plan au comité social territorial.'),
      (v_p2, v_ws, 'Dématérialisation de l''état civil',
       'Passer les registres et la délivrance des actes au format numérique, avec formation des officiers d''état civil.'),
      (v_p3, v_ws, 'Réorganisation des services techniques',
       'Regrouper voirie, espaces verts et bâtiments sous une direction unique et mettre à jour les fiches de poste.');

    -- 3c. Tâches. assignee_id : seul membre du workspace = le compte de test.
    insert into public.project_tasks (workspace_id, project_id, title, description, status, assignee_id, due_date) values
      (v_ws, v_p1, 'Recenser les besoins de formation', 'Synthèse des entretiens professionnels par service.', 'done', v_user, current_date - 20),
      (v_ws, v_p1, 'Arbitrer les priorités avec les responsables de pôle', 'Réunion d''arbitrage : sécurité, management, outils numériques.', 'running', v_user, current_date + 10),
      (v_ws, v_p1, 'Présenter le plan au comité social territorial', 'Note de présentation et calendrier prévisionnel.', 'todo', null, current_date + 35),
      (v_ws, v_p1, 'Inscrire les agents aux sessions CNFPT', 'Après validation du plan.', 'todo', null, current_date + 60),
      (v_ws, v_p2, 'Auditer les registres existants', 'Inventaire des registres 1990–2026 et de leur état de conservation.', 'done', null, current_date - 30),
      (v_ws, v_p2, 'Choisir l''éditeur du logiciel d''état civil', 'En attente de l''inscription budgétaire au budget supplémentaire.', 'blocked', v_user, current_date + 15),
      (v_ws, v_p2, 'Former les officiers d''état civil', 'Deux demi-journées par agent concerné.', 'todo', null, current_date + 75),
      (v_ws, v_p2, 'Basculer la délivrance des actes en ligne', 'Mise en service et information des usagers.', 'todo', null, current_date + 120),
      (v_ws, v_p3, 'Mener les entretiens individuels', 'Un entretien par agent du pôle Services techniques.', 'running', v_user, current_date + 7),
      (v_ws, v_p3, 'Proposer le nouvel organigramme du pôle', 'S''appuyer sur l''organigramme de démonstration.', 'todo', v_user, current_date + 21),
      (v_ws, v_p3, 'Actualiser les fiches de poste', 'Voirie, espaces verts, bâtiments.', 'todo', null, current_date + 40),
      (v_ws, v_p3, 'Présenter la réorganisation en comité social territorial', 'Avis préalable obligatoire.', 'todo', null, current_date + 55);

    -- 4. Relevé, toujours sous l'identité du compte (ce que l'application lui montrera).
    select jsonb_build_object(
        'workspace', v_ws,
        'import', v_import,
        'org_agents_visibles', (select count(*) from public.org_agents where workspace_id = v_ws and source_ref = v_source),
        'racines', (select count(*) from public.org_agents where workspace_id = v_ws and source_ref = v_source and rattachement_id is null),
        'projects_visibles', (select count(*) from public.projects where id in (v_p1, v_p2, v_p3)),
        'project_tasks_visibles', (select count(*) from public.project_tasks where project_id in (v_p1, v_p2, v_p3)))
      into v_releve;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    -- 5. Contrôles en postgres : autres workspaces intacts, rien d'exécutable posé.
    select jsonb_build_object(
        'org_agents',    (select count(*) from public.org_agents    where workspace_id <> v_ws),
        'projects',      (select count(*) from public.projects      where workspace_id <> v_ws),
        'project_tasks', (select count(*) from public.project_tasks where workspace_id <> v_ws))
      into v_autres_apres;
    if v_autres_apres <> v_autres_avant then
        raise exception 'autres workspaces modifiés : avant % après %', v_autres_avant, v_autres_apres;
    end if;

    v_releve := v_releve || jsonb_build_object(
        'autres_workspaces', v_autres_apres,
        'executable_dans_ws', jsonb_build_object(
            'hybrid_nodes',                (select count(*) from public.hybrid_nodes                where workspace_id = v_ws),
            'bot_profiles',                (select count(*) from public.bot_profiles                where workspace_id = v_ws),
            'team_circuits',               (select count(*) from public.team_circuits               where workspace_id = v_ws),
            'circuit_executions',          (select count(*) from public.circuit_executions          where workspace_id = v_ws),
            'circuit_service_grants',      (select count(*) from public.circuit_service_grants      where workspace_id = v_ws),
            'project_service_delegations', (select count(*) from public.project_service_delegations where workspace_id = v_ws),
            'workspace_api_keys',          (select count(*) from public.workspace_api_keys          where workspace_id = v_ws),
            'notifications',               (select count(*) from public.notifications               where workspace_id = v_ws)));

    raise notice 'demo-ct posée : %', v_releve;
end
$$;
