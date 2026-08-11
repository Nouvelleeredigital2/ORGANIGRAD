-- Référence externe optionnelle sur hybrid_nodes : permet de représenter un
-- logiciel/bot d'une autre application APPS-2026 (ex. un bot Hermes/LINK)
-- comme un nœud AGENT_IA, SANS dupliquer ses données métier (règle B3).
--
-- Convention : l'id du nœud EST directement l'identifiant stable de l'entité
-- source (ex. le uuid5 LINK des bots Hermes) — pas de colonne d'id externe
-- séparée, l'idempotence de l'import se fait par upsert sur `id`.
-- `external_app` est purement informatif (badge d'affichage, filtre UI) et
-- n'est jamais utilisé pour l'autorisation.
--
-- Idempotente. Aucune donnée existante modifiée.

alter table public.hybrid_nodes
    add column if not exists external_app text;

comment on column public.hybrid_nodes.external_app is
    'Application source si ce nœud référence une entité externe (ex. ''link'' pour un bot Hermes importé). NULL = nœud natif Organigrad.';
