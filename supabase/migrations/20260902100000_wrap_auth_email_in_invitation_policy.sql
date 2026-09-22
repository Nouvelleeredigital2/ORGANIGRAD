-- Advisor Supabase (performance) « auth_rls_initplan » sur
-- `workspace_invitations` / policy `inv read by email`.
--
-- Pourquoi la migration précédente ne l'a pas attrapée : `20260812122625` est
-- un balayage générique, et son motif ne couvre que
-- `auth.uid|jwt|role`. `auth.email()` n'y figure pas. La policy est donc restée
-- à moitié optimisée en production — `(select auth.uid())` enveloppé,
-- `auth.email()` non — ce qui la fait réévaluer une fois PAR LIGNE.
--
-- Corriger le balayage a posteriori ne changerait rien : il a déjà tourné.
-- On recrée donc explicitement la seule policy concernée.
--
-- Sémantique strictement identique : `(select auth.email())` rend la même
-- valeur, mais PostgreSQL l'évalue une fois pour la requête au lieu d'une fois
-- par ligne (InitPlan). Aucun changement d'autorisation.
--
-- Idempotente : drop if exists + create. Retour arrière : recréer la version
-- de `20260805150200`, qui ne diffère que par l'absence des sous-requêtes.

drop policy if exists "inv read by email" on public.workspace_invitations;

create policy "inv read by email" on public.workspace_invitations for select using (
    (select auth.uid()) is not null
    and lower(email) = lower(coalesce((select auth.email()), ''))
    and revoked_at is null
    and accepted_at is null
    and expires_at > now()
);
