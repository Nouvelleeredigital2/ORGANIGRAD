-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — Bots conversationnels (personas Hermes) parametrables.
--
-- Un bot = un noeud AGENT_IA de l'organigramme (hybrid_nodes, meme identifiant)
-- + une fiche structuree ici. Organigrad devient le PROPRIETAIRE de la
-- configuration editoriale (mission, methode, limites, sources, modele) et
-- compile le prompt systeme livre au lecteur Hermes. LINK conserve l'identite
-- de l'agent (annuaire, presence) ; Hermes reste executant (B7).
--
-- Le prompt compile n'est pas un secret applicatif (les fiches sont deja
-- versionnees) : il est stocke en clair, cloisonne par workspace via RLS. Il
-- ne transite JAMAIS par GET /api/graph ; seul GET /api/bots/bundle (scope
-- bots:export) le sert, pour la synchronisation vers /opt/data/pipeline/personas.
--
-- Additif, idempotent, sans seed. Ne pas appliquer sans qualification de la
-- cible. Pas de begin/commit explicite (cf. 20260909090010).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.bot_profiles (
    -- Meme identifiant que le noeud AGENT_IA correspondant. Pour les 14 bots
    -- importes de LINK, c'est le uuid5 LINK (convention 20260811090000).
    id               uuid primary key,
    workspace_id     uuid not null references public.workspaces(id) on delete cascade,
    -- Identifiant runtime du lecteur Hermes (cle du registre Telegram, ex.
    -- 'anita.instagram.bot', 'hannah'). Jamais affiche comme un nom.
    runtime_id       text not null check (runtime_id ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
    -- Nom du fichier lu par le lecteur (deux conventions historiques
    -- coexistent : 'Hannah.txt' et 'anita.instagram.bot.txt').
    file_name        text not null check (file_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.txt$'),
    display_name     text not null check (length(btrim(display_name)) between 1 and 80),
    family           text not null check (family in ('veilleur', 'redacteur', 'design', 'gardien')),
    brand            text check (brand is null or length(brand) <= 120),
    network          text check (network is null or length(network) <= 40),
    telegram_username text check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{1,64}$'),
    mission          text not null default '' check (length(mission) <= 2000),
    personality      text not null default '' check (length(personality) <= 2000),
    research         text not null default '' check (length(research) <= 4000),
    watch            text not null default '' check (length(watch) <= 4000),
    deliverables     text not null default '' check (length(deliverables) <= 4000),
    method           text not null default '' check (length(method) <= 8000),
    limits           text not null default '' check (length(limits) <= 4000),
    useful_context   text not null default '' check (length(useful_context) <= 2000),
    -- [{ "label": "PubMed", "url": "https://...", "note": "..." }]
    sources          jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
    -- { "provider": "ollama-cloud", "model": "gpt-oss:120b", "temperature": 0.3 }
    model            jsonb not null default '{}'::jsonb check (jsonb_typeof(model) = 'object'),
    enabled          boolean not null default true,
    compiled_prompt  text not null default '' check (length(compiled_prompt) <= 32000),
    compiled_sha256  text not null default '' check (compiled_sha256 = '' or compiled_sha256 ~ '^[0-9a-f]{64}$'),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (workspace_id, runtime_id),
    unique (workspace_id, file_name)
);

comment on table public.bot_profiles is
    'Fiches structurees des bots conversationnels Hermes, propriete Organigrad. Le prompt compile est derive des champs, jamais edite a la main.';

create index if not exists bot_profiles_workspace_family_idx
    on public.bot_profiles (workspace_id, family, display_name);

drop trigger if exists bot_profiles_touch_updated_at on public.bot_profiles;
create trigger bot_profiles_touch_updated_at
    before update on public.bot_profiles
    for each row execute function public.touch_updated_at();

alter table public.bot_profiles enable row level security;
revoke all on public.bot_profiles from public, anon;
grant select, insert, update, delete on public.bot_profiles to authenticated;

-- Lecture : tout membre, y compris viewer. Ecriture : owner/admin/member.
-- Suppression : owner/admin (un bot supprime disparait de la synchronisation).
drop policy if exists bot_profiles_select on public.bot_profiles;
create policy bot_profiles_select on public.bot_profiles
    for select using (public.is_workspace_member(workspace_id));

drop policy if exists bot_profiles_insert on public.bot_profiles;
create policy bot_profiles_insert on public.bot_profiles
    for insert with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

drop policy if exists bot_profiles_update on public.bot_profiles;
create policy bot_profiles_update on public.bot_profiles
    for update using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']))
    with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']));

drop policy if exists bot_profiles_delete on public.bot_profiles;
create policy bot_profiles_delete on public.bot_profiles
    for delete using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ────────────────────────────────────────────────────────────────────────────
-- Cles API techniques avec scopes explicites — fonction SEPAREE (pas une
-- surcharge de `create_workspace_api_key` : PostgREST resout par nom, et une
-- ambiguite d'arite entre deux fonctions homonymes est un risque inutile).
-- `create_workspace_api_key` (2 parametres, scopes par defaut) reste
-- STRICTEMENT inchangee. Aucun scope humain (human:*, node:reset,
-- workspace:admin) n'est acceptable ici.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.create_scoped_workspace_api_key(p_workspace_id uuid, p_name text, p_scopes text[])
 returns table(id uuid, raw_key text, key_prefix text, created_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
    raw     text;
    prefix  text;
    hashed  text;
    new_id  uuid;
    created timestamptz;
    allowed text[] := array['graph:read', 'node:read', 'node:run', 'execution:read', 'bots:export'];
begin
    if coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner', 'admin') then
        raise exception 'forbidden';
    end if;
    if p_scopes is null or array_length(p_scopes, 1) is null then
        raise exception 'scopes requis' using errcode = '22023';
    end if;
    if not (p_scopes <@ allowed) then
        raise exception 'scope non technique refuse' using errcode = '22023';
    end if;

    raw    := 'ok_' || encode(extensions.gen_random_bytes(16), 'hex');
    prefix := substring(raw from 1 for 11);
    hashed := encode(extensions.digest(raw, 'sha256'), 'hex');

    insert into public.workspace_api_keys
        (workspace_id, name, key_hash, key_prefix, created_by, scopes)
    values
        (p_workspace_id, p_name, hashed, prefix, auth.uid(), p_scopes)
    returning workspace_api_keys.id, workspace_api_keys.created_at
        into  new_id, created;

    return query select new_id, raw, prefix, created;
end;
$function$;

revoke execute on function public.create_scoped_workspace_api_key(uuid, text, text[]) from public, anon;
grant execute on function public.create_scoped_workspace_api_key(uuid, text, text[]) to authenticated;
