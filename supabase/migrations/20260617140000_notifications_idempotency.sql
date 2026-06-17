-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — idempotence des notifications (Priorité 5)
--
-- Ajoute une clé d'idempotence aux notifications pour empêcher les doubles envois
-- (retries de la même transition). L'Edge Function `notify-email` consulte cette
-- clé avant d'envoyer ; l'unicité partielle garantit qu'un même envoi réussi
-- n'est pas dupliqué.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.notifications
    add column if not exists idempotency_key text;

-- Unicité par workspace sur les clés non nulles (les anciennes lignes sans clé
-- ne sont pas contraintes).
create unique index if not exists notifications_idempotency_uniq
    on public.notifications (workspace_id, idempotency_key)
    where idempotency_key is not null;

-- Rollback :
-- drop index if exists notifications_idempotency_uniq;
-- alter table public.notifications drop column if exists idempotency_key;
