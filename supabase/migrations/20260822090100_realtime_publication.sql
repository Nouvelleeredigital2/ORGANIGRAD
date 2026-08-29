-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — abonnement Realtime des tables suivies
--
-- TROUVÉ EN MONTANT UNE PILE SUPABASE LOCALE (2026-08-22). La publication
-- `supabase_realtime` existait mais était VIDE : aucune table de l'application
-- n'y figurait, et rien dans le dépôt ne les y ajoutait.
--
-- Conséquence sur une installation neuve : `postgres_changes` ne diffuse
-- jamais rien. La vue Orchestration et le Journal d'activité restent muets —
-- sans erreur, sans indice. C'est d'autant plus trompeur que le code client
-- s'abonne correctement et que le canal passe bien en `SUBSCRIBED`.
--
-- En production, ces tables ont été ajoutées à la main via le dashboard. Le
-- réglage ne vivait donc nulle part dans le dépôt — même famille de dérive que
-- les privilèges de table (cf. 20260822090000).
--
-- Les deux tables correspondent aux deux abonnements du client :
--   - `hybrid_nodes`     → hybridNodeRepo.subscribe (src/services/hybridNodeRepo.ts)
--   - `node_transitions` → transitionsRepo.subscribe (src/services/transitionsRepo.ts)
--
-- L'identité de réplique par défaut suffit : le seul champ lu sur un DELETE est
-- la clé primaire, toujours présente.
--
-- Idempotente : chaque ajout est conditionné à l'absence de la table dans la
-- publication.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
    t text;
begin
    -- La publication n'existe que sur une instance Supabase. Sur un PostgreSQL
    -- nu (bancs de test hermétiques, CI), il n'y a rien à abonner : on sort
    -- sans bruit plutôt que d'échouer sur un objet hors périmètre.
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        raise notice 'Realtime : publication supabase_realtime absente — ignoré';
        return;
    end if;

    foreach t in array array['hybrid_nodes', 'node_transitions'] loop
        if not exists (
            select 1 from pg_publication_tables
             where pubname = 'supabase_realtime'
               and schemaname = 'public'
               and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
            raise notice 'Realtime : public.% ajoutée à supabase_realtime', t;
        end if;
    end loop;
end $$;

-- Rollback :
-- alter publication supabase_realtime drop table public.hybrid_nodes;
-- alter publication supabase_realtime drop table public.node_transitions;
