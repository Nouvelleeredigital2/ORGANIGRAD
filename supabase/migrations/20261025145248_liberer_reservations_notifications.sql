-- Lot 1.6 de l'audit du 22/10/2026 : libérer les réservations notify-email restées pending.
--
-- notify-email réserve la clé d'idempotence (status = 'pending') avant d'appeler Brevo, puis
-- clôt la ligne. Si la fonction meurt entre les deux, la ligne reste pending et la clé bloque
-- à jamais l'e-mail correspondant (toute nouvelle tentative est dédupliquée sans envoi).
--
-- Cette fonction de maintenance, réservée à service_role, passe en failed les réservations de
-- plus de p_older_than et remet leur clé à NULL : l'index unique est partiel
-- (where idempotency_key is not null), la trace est conservée et un nouvel essai repasse.
-- Limite assumée : si Brevo a accepté l'e-mail et que seule la clôture a échoué, un nouvel
-- essai le renverra. notify-email journalise désormais cet échec de clôture.
-- Aucun appel programmé ici : son déclenchement (orchestrateur ou cron) reste à décider.

create or replace function public.release_stale_notification_reservations(
  p_older_than interval default interval '15 minutes'
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.notifications
       set status = 'failed',
           error = coalesce(error, 'reservation_expired'),
           idempotency_key = null
     where status = 'pending'
       and created_at < now() - p_older_than
    returning 1
  )
  select count(*)::int from released;
$$;

revoke execute on function public.release_stale_notification_reservations(interval) from public, anon, authenticated;
grant execute on function public.release_stale_notification_reservations(interval) to service_role;

comment on function public.release_stale_notification_reservations(interval) is
  'Libère les réservations notify-email restées pending (audit du 22/10/2026, Lot 1.6).';
