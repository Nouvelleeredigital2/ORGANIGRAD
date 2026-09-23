-- Réservation durable des assertions d'acteur Synapse consommées par OrganiGrad.
-- Additive : aucune migration historique n'est rejouée.
create table if not exists public.actor_assertion_requests (
 request_id uuid primary key,
 purpose text not null check (purpose in ('circuit-runs-list','circuit-decision','node-decision')),
 http_method text not null check (http_method in ('GET','POST')),
 route text not null check (route like '/api/link-bridge/%'),
 body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
 idempotency_key uuid,
 expires_at timestamptz not null,
 consumed_at timestamptz not null default clock_timestamp(),
 check ((purpose='circuit-decision' and idempotency_key is not null) or (purpose in ('circuit-runs-list','node-decision') and idempotency_key is null))
);
alter table public.actor_assertion_requests enable row level security;
revoke all on public.actor_assertion_requests from public, anon, authenticated, service_role;
-- Le backend OrganiGrad se connecte sous le propriétaire de sa base. Aucun rôle API ne reçoit d'accès direct.

-- Rollback : drop table public.actor_assertion_requests;
