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
create index if not exists actor_assertion_requests_expires_at_idx
 on public.actor_assertion_requests(expires_at);

-- Une réservation purge au plus 128 lignes expirées. La table reste donc
-- bornée sans DELETE massif dans le chemin d'une décision, et l'index évite
-- un parcours complet. La deuxième invocation d'un request_id rend false.
create or replace function public.reserve_actor_assertion_request(
 p_request_id uuid,p_purpose text,p_http_method text,p_route text,
 p_body_sha256 text,p_idempotency_key uuid,p_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
 with expired as (
  select request_id from public.actor_assertion_requests
  where expires_at<=clock_timestamp()
  order by expires_at
  limit 128
  for update skip locked
 )
 delete from public.actor_assertion_requests r using expired e
 where r.request_id=e.request_id;

 insert into public.actor_assertion_requests(
  request_id,purpose,http_method,route,body_sha256,idempotency_key,expires_at
 ) values(
  p_request_id,p_purpose,p_http_method,p_route,p_body_sha256,p_idempotency_key,p_expires_at
 ) on conflict(request_id) do nothing;
 get diagnostics inserted=row_count;
 return inserted=1;
end $$;
revoke all on function public.reserve_actor_assertion_request(uuid,text,text,text,text,uuid,timestamptz)
 from public,anon,authenticated,service_role;
-- Le backend OrganiGrad se connecte sous le propriétaire de sa base. Aucun rôle API ne reçoit d'accès direct.

-- Rollback :
-- drop function public.reserve_actor_assertion_request(uuid,text,text,text,text,uuid,timestamptz);
-- drop table public.actor_assertion_requests;
