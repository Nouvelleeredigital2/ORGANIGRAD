-- ════════════════════════════════════════════════════════════════════════════
-- Organigrad — réconciliation P2/P5 (appliquée sur la base de prod existante)
--
-- CONTEXTE : la base `xucmfdggetwxmpquqjvj` était DÉJÀ durcie avant ce dépôt —
-- RLS activé sur toutes les tables avec des policies équivalentes (noms
-- différents : `ws read members`, `ak read admin`, `hn insert writers`…), et les
-- fonctions `create_workspace_api_key` / `is_workspace_member` / `workspace_role_of`
-- existaient déjà.
--
-- Appliquer `20260617120000_init_schema.sql` + `20260617130000_rls.sql` tels quels
-- sur CETTE base aurait dupliqué les policies et surchargé la RPC. Cette migration
-- applique donc UNIQUEMENT les deltas réels nécessaires au code orchestrateur/edge,
-- sans rien dupliquer. (Les fichiers init_schema/rls/idempotency restent la
-- référence pour un déploiement « from scratch ».)
--
-- Idempotente. Appliquée le 2026-06-18 via Supabase MCP.
-- ════════════════════════════════════════════════════════════════════════════

-- P2 : scopes + expiration sur les clés API (lus par orchestrator/src/api/auth.ts)
alter table public.workspace_api_keys
    add column if not exists scopes text[] not null default array[]::text[];
alter table public.workspace_api_keys
    add column if not exists expires_at timestamptz;

comment on column public.workspace_api_keys.scopes is
    'Scopes accordés. Une clé technique ne reçoit jamais human:approve/human:reject/node:reset.';

-- P5 : idempotence des notifications (utilisée par l'Edge Function notify-email)
alter table public.notifications
    add column if not exists idempotency_key text;
create unique index if not exists notifications_idempotency_uniq
    on public.notifications (workspace_id, idempotency_key)
    where idempotency_key is not null;

-- P2 : la RPC de création de clé assigne désormais des scopes techniques par
-- défaut (jamais de scope humain). Signature, type de retour et conventions
-- (workspace_role_of, schéma extensions, format de clé) STRICTEMENT préservés.
create or replace function public.create_workspace_api_key(p_workspace_id uuid, p_name text)
 returns table(id uuid, raw_key text, key_prefix text, created_at timestamptz)
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
    raw     text;
    prefix  text;
    hashed  text;
    new_id  uuid;
    created timestamptz;
begin
    if public.workspace_role_of(p_workspace_id) not in ('owner','admin') then
        raise exception 'forbidden';
    end if;

    raw    := 'ok_' || encode(extensions.gen_random_bytes(16), 'hex');
    prefix := substring(raw from 1 for 11);
    hashed := encode(extensions.digest(raw, 'sha256'), 'hex');

    insert into public.workspace_api_keys
        (workspace_id, name, key_hash, key_prefix, created_by, scopes)
    values
        (p_workspace_id, p_name, hashed, prefix, auth.uid(),
         array['graph:read','node:read','node:run','execution:read']::text[])
    returning workspace_api_keys.id, workspace_api_keys.created_at
        into  new_id, created;

    return query select new_id, raw, prefix, created;
end;
$function$;
