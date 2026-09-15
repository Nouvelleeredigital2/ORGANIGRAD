-- Présence et cadence observées chez l'application source (ex. LINK/Hermès).
--
-- POURQUOI : le bridge LINK expose pour chaque bot une présence (`online`) et
-- une cadence (« gate 3 », « hebdo lundi 8h00 ») que l'import jetait. À l'écran,
-- les 20 bots importés apparaissaient tous en `IDLE` — ce qui est EXACT au sens
-- de la machine à transitions (aucune exécution en cours) mais se lit comme un
-- parc de bots morts alors qu'ils sont tous en ligne.
--
-- `status` n'est donc PAS détourné : il reste l'état d'exécution Organigrad.
-- La présence est une observation EXTERNE, distincte, et volatile.
--
-- VOLATILITÉ : une présence n'est vraie qu'à l'instant où on l'a relevée, et
-- l'import est manuel. `presence_observed_at` est donc obligatoire en pratique :
-- l'interface doit dater l'observation au lieu de la présenter comme un état
-- courant. C'est la même règle que `ListResult.stale` côté SPA — ne jamais faire
-- passer un cache pour la vérité du moment.
--
-- Ces colonnes sont écrites UNIQUEMENT par l'import LINK, jamais par l'édition
-- d'un nœud : comme `external_app`, elles sont absentes de la liste de colonnes
-- du `on conflict do update` de `upsertNode`, donc une édition depuis la SPA les
-- conserve au lieu de les écraser.
--
-- Idempotente. Aucune donnée existante modifiée.

alter table public.hybrid_nodes
    add column if not exists presence text,
    add column if not exists presence_observed_at timestamptz,
    add column if not exists cadence text;

comment on column public.hybrid_nodes.presence is
    'Présence observée chez l''application source lors du dernier import (ex. ''online''). NULL = jamais observée. Ne pas confondre avec `status`, qui est l''état d''exécution Organigrad.';

comment on column public.hybrid_nodes.presence_observed_at is
    'Date du relevé de `presence`. Une présence sans date ne doit pas être affichée comme courante.';

comment on column public.hybrid_nodes.cadence is
    'Cadence déclarée par l''application source (ex. ''à la demande (gate 3)'', ''hebdo lundi 8h00''). Informatif.';
