-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — table `org_agents` : les fiches RH de l'organigramme
--
-- Jusqu'ici l'organigramme n'existait que côté client : les agents venaient
-- d'un CSV et les modifications/suppressions vivaient dans localStorage, sous
-- des clés GLOBALES non qualifiées par source. Conséquence : un agent supprimé
-- dans un fichier A disparaissait silencieusement d'un fichier B dès que les
-- identifiants se recoupaient.
--
-- Nom : `org_agents` et non `agents` — `hybrid_nodes.type` contient déjà la
-- valeur 'AGENT_IA' et l'orchestrateur emploie « agent » au sens agent IA.
--
-- Idempotente. Bloc de retour arrière commenté en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.org_agents (
    id                uuid primary key default gen_random_uuid(),
    workspace_id      uuid not null references public.workspaces(id) on delete cascade,

    -- ── Provenance ──────────────────────────────────────────────────────────
    -- Le triplet (source_kind, source_ref, external_key) cloisonne les fiches
    -- par source : deux fichiers différents ⇒ deux `source_ref` ⇒ collision
    -- structurellement impossible.
    source_kind       text not null default 'manual'
                          check (source_kind in ('import', 'remote_csv', 'manual')),
    -- Nom de fichier importé, URL CSV normalisée, ou '' en saisie manuelle.
    source_ref        text not null default '',
    -- Clé métier stable (nom|prénom|fonction) — JAMAIS l'index de ligne.
    external_key      text not null,

    -- ── Fiche ───────────────────────────────────────────────────────────────
    nom               text not null default '',
    prenom            text not null default '',
    fonction          text not null default '',
    titre             text not null default '',
    service           text not null default '',
    pole              text not null default '',

    -- Auto-référence SANS `on delete` (NO ACTION) : si le trigger de
    -- reparentage échouait, la suppression lèverait une violation de clé
    -- étrangère au lieu d'orpheliner en silence. L'échec doit être bruyant.
    rattachement_id   uuid references public.org_agents(id),

    grade_style       text not null default 'Agent'
                          check (grade_style in ('Direction', 'Responsable', 'Expert', 'Agent', 'Support')),
    type_temps        text not null default 'Complet',
    nbi               text,
    avatar_url        text,
    email             text,
    phone             text,

    created_by        uuid references auth.users(id) on delete set null,
    updated_by        uuid references auth.users(id) on delete set null,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    -- Un agent ne peut pas être son propre supérieur.
    constraint org_agents_no_self_parent check (rattachement_id is distinct from id)
);

-- Clé anti-contamination : l'unicité est portée par la source, pas globale.
create unique index if not exists org_agents_source_identity_idx
    on public.org_agents (workspace_id, source_kind, source_ref, external_key);

create index if not exists org_agents_workspace_idx     on public.org_agents (workspace_id);
create index if not exists org_agents_ws_pole_idx       on public.org_agents (workspace_id, pole);
create index if not exists org_agents_rattachement_idx  on public.org_agents (rattachement_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Garde d'intégrité : workspace immuable côté client, rattachement dans le même
-- workspace, et absence de cycle hiérarchique.
--
-- Un CHECK ne peut pas détecter un cycle (contrainte multi-lignes) : le trigger
-- est la seule option en Postgres.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_org_agents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    ancetre uuid;
    garde   int := 0;
begin
    new.updated_at := now();

    if current_user in ('authenticated', 'anon') then
        new.updated_by := auth.uid();
        if tg_op = 'INSERT' then
            new.created_by := coalesce(new.created_by, auth.uid());
        elsif tg_op = 'UPDATE' then
            -- Le workspace d'une fiche ne se change pas depuis le client.
            new.workspace_id := old.workspace_id;
        end if;
    end if;

    if new.rattachement_id is not null then
        -- Même workspace (défense en profondeur : la FK ne le garantit pas).
        if not exists (
            select 1 from public.org_agents p
             where p.id = new.rattachement_id
               and p.workspace_id = new.workspace_id
        ) then
            raise exception 'rattachement_id % hors du workspace %',
                new.rattachement_id, new.workspace_id
                using errcode = '23514';
        end if;

        -- Détection de cycle : on remonte la chaîne des supérieurs.
        ancetre := new.rattachement_id;
        while ancetre is not null loop
            garde := garde + 1;
            if ancetre = new.id then
                raise exception 'cycle hierarchique detecte sur l''agent %', new.id
                    using errcode = '23514';
            end if;
            if garde > 64 then
                raise exception 'profondeur hierarchique anormale (cycle probable) sur l''agent %', new.id
                    using errcode = '23514';
            end if;
            select p.rattachement_id into ancetre
              from public.org_agents p
             where p.id = ancetre;
        end loop;
    end if;

    return new;
end;
$$;

drop trigger if exists org_agents_guard on public.org_agents;
create trigger org_agents_guard
    before insert or update on public.org_agents
    for each row execute function public.tg_org_agents_guard();

-- ────────────────────────────────────────────────────────────────────────────
-- Suppression d'un responsable : ADOPTION PAR LE GRAND-PARENT.
--
-- Les subordonnés sont rattachés au supérieur du supprimé ; s'il était racine,
-- ils deviennent racines. Refuser la suppression obligerait à repositionner N
-- personnes à la main ; les orpheliner produirait des racines parasites
-- illisibles dont la cause serait introuvable une semaine plus tard.
--
-- En trigger plutôt qu'en RPC : s'applique à TOUS les rédacteurs (client,
-- orchestrateur en service_role, psql).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_org_agents_reparent_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    update public.org_agents
       set rattachement_id = old.rattachement_id
     where rattachement_id = old.id
       and workspace_id    = old.workspace_id;
    return old;
end;
$$;

drop trigger if exists org_agents_reparent_children on public.org_agents;
create trigger org_agents_reparent_children
    before delete on public.org_agents
    for each row execute function public.tg_org_agents_reparent_children();

-- ────────────────────────────────────────────────────────────────────────────
-- Retour arrière (à décommenter si nécessaire) :
--
-- drop trigger if exists org_agents_reparent_children on public.org_agents;
-- drop trigger if exists org_agents_guard on public.org_agents;
-- drop function if exists public.tg_org_agents_reparent_children();
-- drop function if exists public.tg_org_agents_guard();
-- drop table if exists public.org_agents;
-- ────────────────────────────────────────────────────────────────────────────
