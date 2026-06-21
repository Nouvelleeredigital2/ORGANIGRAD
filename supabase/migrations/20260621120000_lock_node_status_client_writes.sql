-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — verrou des écritures client sur hybrid_nodes (audit V2 #1, slice 1)
--
-- Empêche le contournement de la machine à états par écriture directe depuis le
-- frontend : le SPA écrit via PostgREST sous les rôles `authenticated`/`anon` ;
-- l'orchestrateur écrit via une connexion DIRECTE (service_role/postgres) et
-- reste seul habilité à muter `status`.
--
-- Effet pour un client (authenticated/anon) :
--   - INSERT : `status` forcé à 'IDLE' (le client ne choisit pas l'état initial) ;
--   - UPDATE : `status` conservé (seul l'orchestrateur le change via la machine à états).
-- `updated_at` est systématiquement rafraîchi (corrige l'absence de garantie).
--
-- NB : ne couvre PAS encore le chiffrement/masquage des secrets d'intégration
-- (system_prompt/mcp_config/notification_channels) — slice suivante de #1
-- (API de mutation côté serveur). Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.tg_hybrid_nodes_client_guard()
returns trigger
language plpgsql
as $$
begin
    if current_user in ('authenticated', 'anon') then
        if tg_op = 'INSERT' then
            new.status := 'IDLE';
        elsif tg_op = 'UPDATE' then
            new.status := old.status;
        end if;
    end if;
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists hybrid_nodes_client_guard on public.hybrid_nodes;
create trigger hybrid_nodes_client_guard
    before insert or update on public.hybrid_nodes
    for each row execute function public.tg_hybrid_nodes_client_guard();

-- Rollback :
-- drop trigger if exists hybrid_nodes_client_guard on public.hybrid_nodes;
-- drop function if exists public.tg_hybrid_nodes_client_guard();
