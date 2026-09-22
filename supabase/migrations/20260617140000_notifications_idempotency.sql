-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — idempotence des notifications (Priorité 5)
--
-- Ajoute une clé d'idempotence aux notifications pour empêcher les doubles envois
-- (retries de la même transition). L'Edge Function `notify-email` RÉSERVE cette
-- clé (`status = 'pending'`) AVANT d'envoyer : c'est l'unicité partielle
-- ci-dessous qui arbitre entre deux invocations concurrentes.
--
-- Note de 2026-08-22 : la formulation d'origine disait que cette unicité
-- « garantit qu'un même envoi réussi n'est pas dupliqué ». C'était faux tant que
-- la fonction consultait la clé AVANT d'envoyer et ne l'insérait qu'APRÈS —
-- l'index ne faisait alors échouer que la seconde écriture, l'e-mail étant déjà
-- parti. L'ordre a été corrigé dans la fonction ; la garantie tient désormais.
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
