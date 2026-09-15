-- Candidat local uniquement. Ne pas appliquer sans qualification de la cible.
--
-- Reçus persistants de production : lien durable entre une exécution de circuit (run, étape,
-- version) et la RÉFÉRENCE d'un livrable produit chez une application propriétaire. Aucun contenu
-- éditorial, aucun prompt, aucune clé Engine, aucun JWT — seulement des références et des empreintes.
--
-- Mesuré le 15/09 sur xucmfdggetwxmpquqjvj : circuit_executions(id, workspace_id, circuit_id,
-- idempotency_key, created_by, version, state, updated_at) et circuit_step_attempts(run_id,
-- workspace_id, run_version, step_id, payload_sha256, fencing_token, status, lease_until,
-- dispatched_at, job_id, updated_at) ne relient aucune exécution à une référence de livrable.
-- Le "mandat utilisé" est le grant de public.project_service_delegations (autorité de délégation).
--
-- Cycle d'un reçu : reserved → accepted (réponse vérifiée) | uncertain (réponse perdue, aucune
-- seconde écriture possible) ; un reçu de contrôle (kind = review) peut être superseded par une
-- correction, ses références anciennes restent.
--
-- Rollback (objets nouveaux uniquement, après export du journal si nécessaire) :
--   drop function public.circuit_receipt_supersede(uuid,uuid);
--   drop function public.circuit_receipt_mark_uncertain(uuid);
--   drop function public.circuit_receipt_accept(uuid,jsonb);
--   drop function public.circuit_receipt_reserve(uuid,uuid,integer,text,jsonb,uuid,text,uuid);
--   drop table public.circuit_execution_receipts;

create table public.circuit_execution_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  run_id uuid not null,
  run_version integer not null check (run_version > 0),
  step_id text not null check (length(step_id) between 1 and 128),
  project jsonb not null check (jsonb_typeof(project) = 'object'),
  idempotency_key uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  mandate_id uuid references public.project_service_delegations(id),
  status text not null default 'reserved' check (status in ('reserved','uncertain','accepted','superseded')),
  reference jsonb check (reference is null or jsonb_typeof(reference) = 'object'),
  superseded_by uuid references public.circuit_execution_receipts(id),
  reserved_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (run_id, workspace_id) references public.circuit_executions(id, workspace_id),
  unique (workspace_id, run_id, step_id, idempotency_key),
  check ((status in ('accepted','superseded')) = (reference is not null)),
  check ((status in ('accepted','superseded')) = (accepted_at is not null)),
  check ((status = 'superseded') = (superseded_by is not null))
);
create index circuit_execution_receipts_run_idx on public.circuit_execution_receipts (workspace_id, run_id, step_id);

alter table public.circuit_execution_receipts enable row level security;
revoke all on table public.circuit_execution_receipts from public, anon, authenticated, service_role;

-- Réserve AVANT l'appel externe. Même clé + même empreinte → le reçu existant (aucune seconde
-- écriture) ; même clé + empreinte différente → IDEMPOTENCY_CONFLICT ; reçu incertain → RECEIPT_UNCERTAIN.
create function public.circuit_receipt_reserve(
  p_workspace uuid, p_run uuid, p_run_version integer, p_step text, p_project jsonb,
  p_idempotency_key uuid, p_payload_sha256 text, p_mandate uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare receipt public.circuit_execution_receipts;
begin
  if p_workspace is null or p_run is null or p_idempotency_key is null
     or coalesce(p_run_version, 0) <= 0 or length(coalesce(p_step, '')) not between 1 and 128
     or jsonb_typeof(p_project) is distinct from 'object' or coalesce(p_payload_sha256, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_RECEIPT';
  end if;
  if not exists (select 1 from public.circuit_executions e where e.id = p_run and e.workspace_id = p_workspace) then raise exception 'RUN_UNAVAILABLE'; end if;
  if p_mandate is not null and not exists (
       select 1 from public.project_service_delegations d
       where d.id = p_mandate and d.workspace_id = p_workspace and d.revoked_at is null and d.expires_at > clock_timestamp()) then
    raise exception 'MANDATE_UNAVAILABLE';
  end if;
  -- Sérialise par exécution : deux réservations concurrentes de la même clé ne se croisent pas.
  perform 1 from public.circuit_executions where id = p_run and workspace_id = p_workspace for update;
  select * into receipt from public.circuit_execution_receipts
   where workspace_id = p_workspace and run_id = p_run and step_id = p_step and idempotency_key = p_idempotency_key;
  if receipt.id is not null then
    if receipt.payload_sha256 <> p_payload_sha256 then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    if receipt.status = 'uncertain' then raise exception 'RECEIPT_UNCERTAIN'; end if;
    return to_jsonb(receipt);
  end if;
  insert into public.circuit_execution_receipts (workspace_id, run_id, run_version, step_id, project, idempotency_key, payload_sha256, mandate_id)
  values (p_workspace, p_run, p_run_version, p_step, p_project, p_idempotency_key, p_payload_sha256, p_mandate)
  returning * into receipt;
  return to_jsonb(receipt);
end $$;

-- Marque accepté SEULEMENT après réponse vérifiée, avec la référence du livrable.
create function public.circuit_receipt_accept(p_receipt uuid, p_reference jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare receipt public.circuit_execution_receipts;
begin
  if jsonb_typeof(p_reference) is distinct from 'object'
     or not (p_reference ?& array['sourceApp','id','kind','version','canonicalUrl'])
     or exists (select 1 from jsonb_each(p_reference) where key in ('sourceApp','id','kind','canonicalUrl') and jsonb_typeof(value) <> 'string')
     or jsonb_typeof(p_reference->'version') not in ('number','string')
     or length(p_reference->>'sourceApp') not between 1 and 100
     or length(p_reference->>'id') not between 1 and 200
     or length(p_reference->>'kind') not between 1 and 64
     or p_reference->>'canonicalUrl' !~ '^https://[^[:space:]@]+$' then
    raise exception 'INVALID_REFERENCE';
  end if;
  select * into receipt from public.circuit_execution_receipts where id = p_receipt for update;
  if receipt.id is null then raise exception 'RECEIPT_UNAVAILABLE'; end if;
  if receipt.status in ('accepted','superseded') then
    if receipt.reference <> p_reference then raise exception 'RECEIPT_CONFLICT'; end if;
    return to_jsonb(receipt);
  end if;
  update public.circuit_execution_receipts
     set status = 'accepted', reference = p_reference, accepted_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = p_receipt returning * into receipt;
  return to_jsonb(receipt);
end $$;

-- Réponse perdue : le reçu devient incertain et bloque toute seconde écriture sous la même clé.
create function public.circuit_receipt_mark_uncertain(p_receipt uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare receipt public.circuit_execution_receipts;
begin
  select * into receipt from public.circuit_execution_receipts where id = p_receipt for update;
  if receipt.id is null then raise exception 'RECEIPT_UNAVAILABLE'; end if;
  if receipt.status = 'uncertain' then return to_jsonb(receipt); end if;
  if receipt.status <> 'reserved' then raise exception 'RECEIPT_ALREADY_SETTLED'; end if;
  update public.circuit_execution_receipts set status = 'uncertain', updated_at = clock_timestamp() where id = p_receipt returning * into receipt;
  return to_jsonb(receipt);
end $$;

-- Une correction conserve les références anciennes : seul un reçu de CONTRÔLE (kind = review)
-- accepté peut être remplacé, par un reçu accepté de la même exécution. La règle de dépendance
-- (quel contrôle dépend de quel livrable) reste à l'orchestrateur, qui appelle explicitement.
create function public.circuit_receipt_supersede(p_receipt uuid, p_successor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare receipt public.circuit_execution_receipts; successor public.circuit_execution_receipts;
begin
  if p_receipt = p_successor then raise exception 'INVALID_RECEIPT'; end if;
  select * into receipt from public.circuit_execution_receipts where id = p_receipt for update;
  if receipt.id is null then raise exception 'RECEIPT_UNAVAILABLE'; end if;
  if receipt.status = 'superseded' then
    if receipt.superseded_by <> p_successor then raise exception 'RECEIPT_CONFLICT'; end if;
    return to_jsonb(receipt);
  end if;
  if receipt.status <> 'accepted' then raise exception 'RECEIPT_NOT_ACCEPTED'; end if;
  if receipt.reference->>'kind' <> 'review' then raise exception 'RECEIPT_NOT_CONTROL'; end if;
  select * into successor from public.circuit_execution_receipts where id = p_successor;
  if successor.id is null or successor.status <> 'accepted'
     or successor.run_id <> receipt.run_id or successor.workspace_id <> receipt.workspace_id then
    raise exception 'SUCCESSOR_UNAVAILABLE';
  end if;
  update public.circuit_execution_receipts
     set status = 'superseded', superseded_by = p_successor, updated_at = clock_timestamp()
   where id = p_receipt returning * into receipt;
  return to_jsonb(receipt);
end $$;

revoke all on function public.circuit_receipt_reserve(uuid, uuid, integer, text, jsonb, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.circuit_receipt_accept(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.circuit_receipt_mark_uncertain(uuid) from public, anon, authenticated, service_role;
revoke all on function public.circuit_receipt_supersede(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.circuit_receipt_reserve(uuid, uuid, integer, text, jsonb, uuid, text, uuid) to service_role;
grant execute on function public.circuit_receipt_accept(uuid, jsonb) to service_role;
grant execute on function public.circuit_receipt_mark_uncertain(uuid) to service_role;
grant execute on function public.circuit_receipt_supersede(uuid, uuid) to service_role;
