-- ════════════════════════════════════════════════════════════════════════════
-- Régularisation rétroactive.
--
-- Ces trois colonnes ont été appliquées directement sur le projet Supabase
-- xucmfdggetwxmpquqjvj le 12/09/2026 (version distante 20260912115702), sans
-- fichier correspondant dans ce dépôt. Le dépôt ne décrivait donc plus le
-- schéma réel, et une reconstruction depuis les migrations repartait d'un
-- `hybrid_nodes` incomplet.
--
-- Ce fichier reproduit à l'identique la définition relevée en base, commentaires
-- de colonnes compris. Il est idempotent : sur la cible où les colonnes existent
-- déjà, il ne fait que reposer les commentaires ; ailleurs, il crée les colonnes.
-- Aucune donnée n'est écrite. Additif, comme les migrations précédentes, et sans
-- begin/commit explicite (cf. 20260909090010).
-- ════════════════════════════════════════════════════════════════════════════

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
