-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — intégrité multi-tenant du parent (audit V2, risques élevés)
--
-- Étend le garde-fou `hybrid_nodes` : en plus du verrou de statut côté client,
-- impose que `parent_id` référence un nœud du MÊME workspace (empêche un parent
-- cross-tenant). S'applique à TOUS les rédacteurs (client comme orchestrateur).
-- Appliquée + vérifiée en prod (insert cross-workspace rejeté). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.tg_hybrid_nodes_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- Verrou des écritures client sur le statut (machine à états).
    if current_user in ('authenticated', 'anon') then
        if tg_op = 'INSERT' then
            new.status := 'IDLE';
        elsif tg_op = 'UPDATE' then
            new.status := old.status;
        end if;
    end if;
    new.updated_at := now();

    -- Intégrité multi-tenant : le parent doit appartenir au MÊME workspace.
    if new.parent_id is not null then
        if not exists (
            select 1 from public.hybrid_nodes p
             where p.id = new.parent_id and p.workspace_id = new.workspace_id
        ) then
            raise exception 'parent_id % hors du workspace %', new.parent_id, new.workspace_id
                using errcode = '23514';
        end if;
    end if;

    return new;
end;
$$;
