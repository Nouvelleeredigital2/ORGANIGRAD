-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — droits d'exécution des fonctions d'aide RLS
--
-- DÉFAUT CORRIGÉ (préexistant, découvert le 2026-08-03) : les policies de
-- TOUTES les tables — `workspaces`, `workspace_members`, `hybrid_nodes`,
-- `node_transitions`, `notifications`, `workspace_api_keys`,
-- `workspace_invitations` — appellent `is_workspace_member` ou
-- `workspace_role_of`, mais ces deux fonctions n'accordaient l'exécution qu'à
-- `postgres` et `service_role`.
--
-- Or une expression de policy est évaluée avec les privilèges de l'appelant :
-- un utilisateur connecté obtenait `42501 permission denied for function
-- is_workspace_member` au lieu d'un résultat. Autrement dit, la couche RLS
-- était inopérante pour tout utilisateur authentifié — la base était vide, ce
-- qui explique que personne ne l'ait constaté.
--
-- Vérifié après application : lecture du workspace, écriture `member`, refus
-- `viewer`, lecture `viewer`, import via RPC — tous conformes.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- `authenticated` doit pouvoir évaluer les fonctions utilisées par les policies.
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.workspace_role_of(uuid)   to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

-- `anon` n'en a aucun usage : ces fonctions renvoient toujours faux pour lui
-- (auth.uid() est nul) et les exposer en RPC publique déclenche l'avertissement
-- « Public Can Execute SECURITY DEFINER Function ».
revoke execute on function public.has_workspace_role(uuid, text[]) from public, anon;

-- L'import est réservé aux utilisateurs authentifiés ; la RLS fait le reste
-- (la fonction est en SECURITY INVOKER).
revoke execute on function public.import_org_agents(uuid, text, text, jsonb, text) from public, anon;
grant  execute on function public.import_org_agents(uuid, text, text, jsonb, text) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Retour arrière : déconseillé. Retirer ces droits rend la RLS inutilisable
-- pour les utilisateurs connectés (toute lecture échoue en 42501).
-- ────────────────────────────────────────────────────────────────────────────
