-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — privilèges de table manquants pour le rôle `authenticated`
--
-- TROUVÉ EN MONTANT UNE PILE SUPABASE LOCALE (2026-08-22). Une installation
-- neuve, provisionnée par le chemin documenté (baseline + migrations
-- postérieures), donnait une base que l'application NE PEUT PAS UTILISER :
-- toute lecture répondait
--
--     42501 permission denied for table workspace_members
--
-- La RLS était pourtant complète — 10 tables, toutes en `row level security`,
-- toutes avec leurs policies. Mais la RLS FILTRE des lignes ; elle n'accorde
-- aucun privilège. Sans `GRANT`, PostgREST se fait refuser l'accès à la table
-- avant même que la moindre policy soit évaluée.
--
-- `authenticated` et `anon` n'avaient que `REFERENCES, TRIGGER, TRUNCATE`,
-- c'est-à-dire les privilèges par défaut de Supabase sur une table nouvellement
-- créée dans `public` — donc rien d'utile.
--
-- Pourquoi personne ne l'a vu : la production n'a jamais été provisionnée par
-- ce chemin (schéma créé hors dépôt, cf. supabase/migrations/README.md). Le
-- défaut ne se manifeste qu'au moment de monter une préproduction ou de
-- restaurer après incident — exactement le scénario que P2-16 veut couvrir.
--
-- Les privilèges ci-dessous sont DÉRIVÉS DES POLICIES existantes, table par
-- table, plutôt qu'accordés en bloc : une commande sans policy correspondante
-- resterait de toute façon refusée, et l'écart signalerait une incohérence.
--
-- `anon` n'obtient rien : toutes les données sont cloisonnées par workspace et
-- exigent une session. Un visiteur anonyme n'a rien à lire ici.
--
-- Idempotente : `grant` est répétable sans effet de bord.
-- ════════════════════════════════════════════════════════════════════════════

grant select                         on public.audit_log             to authenticated;
grant select                         on public.node_transitions      to authenticated;
grant select                         on public.notifications         to authenticated;
grant select, update                 on public.profiles              to authenticated;
grant select, insert, update         on public.workspace_invitations to authenticated;
grant select, insert, update, delete on public.hybrid_nodes          to authenticated;
grant select, insert, update, delete on public.org_agents            to authenticated;
grant select, insert, update, delete on public.workspace_api_keys    to authenticated;
grant select, insert, update, delete on public.workspace_members     to authenticated;
grant select, insert, update, delete on public.workspaces            to authenticated;

-- La vue est lue par MembersView ; elle s'exécute avec les droits de son
-- propriétaire, mais l'accès à la vue elle-même doit être accordé.
grant select on public.workspace_members_view to authenticated;

-- Rollback :
-- revoke all on all tables in schema public from authenticated;
