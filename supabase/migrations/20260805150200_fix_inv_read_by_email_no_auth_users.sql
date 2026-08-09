-- Correction : la policy `inv read by email` interrogeait auth.users en
-- sous-requête. Les policies s'exécutent avec les privilèges de l'appelant
-- (`authenticated`), qui n'a — à juste titre — aucun droit sur auth.users :
-- toute lecture ou écriture directe de workspace_invitations échouait en
-- `42501 permission denied for table users` (liste des invitations et
-- révocation dans la SPA). L'e-mail est désormais lu depuis le claim JWT
-- via le helper Supabase auth.email(), sans toucher auth.users.
--
-- Idempotente : drop policy if exists + create. Aucune donnée modifiée.
-- Retour arrière : recréer la policy antérieure (baseline 2026-08-03,
-- lignes 578-583) — elle réintroduit le bug.

drop policy if exists "inv read by email" on public.workspace_invitations;
create policy "inv read by email" on public.workspace_invitations for select using (
    auth.uid() is not null
    and lower(email) = lower(coalesce(auth.email(), ''))
    and revoked_at is null and accepted_at is null and expires_at > now()
);
