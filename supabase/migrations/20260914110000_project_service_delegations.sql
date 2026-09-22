-- CANDIDATE ONLY. Personal consent and schedule:create remain separate.
create table public.project_service_delegations (
 id uuid primary key, workspace_id uuid not null, project_id uuid not null,
 api_key_id uuid not null references public.workspace_api_keys(id),
 node_id uuid not null references public.hybrid_nodes(id),
 target jsonb not null check(jsonb_typeof(target)='object'),
 actions text[] not null check(cardinality(actions)>0 and actions <@ array['execution:read','step:execute','voice:assign','voice:resolve']::text[]),
 granted_by uuid not null, created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, revoked_at timestamptz, version integer not null default 1,
 foreign key(project_id,workspace_id) references public.projects(id,workspace_id),
 check(expires_at>created_at), check(version>0)
);
create index project_service_delegations_project on public.project_service_delegations(workspace_id,project_id);
create table public.project_service_delegation_audit (
 id bigint generated always as identity primary key,
 grant_id uuid not null references public.project_service_delegations(id),
 actor_id uuid not null, kind text not null check(kind in ('created','revoked','checked')),
 detail jsonb not null default '{}'::jsonb, recorded_at timestamptz not null default clock_timestamp()
);
alter table public.project_service_delegations enable row level security;
alter table public.project_service_delegation_audit enable row level security;
revoke all on public.project_service_delegations,public.project_service_delegation_audit from public,anon,authenticated,service_role;
revoke all on sequence public.project_service_delegation_audit_id_seq from public,anon,authenticated,service_role;
comment on table public.project_service_delegations is 'Server RPC only; no browser RLS policies intentionally. A check is not a dispatch, job receipt, or human approval.';

create function public.project_service_delegation_command(p_workspace uuid,p_project uuid,p_user uuid,p_key uuid,p_command text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 g public.project_service_delegations%rowtype; k public.workspace_api_keys%rowtype;
 r record; v_role text; v_actions text[]; v_exp timestamptz; v_step jsonb; v_result jsonb;
 v_id uuid; v_now timestamptz;
begin
 perform pg_catalog.set_config('statement_timeout','5s',true);
 perform pg_catalog.set_config('lock_timeout','1s',true);
 if p_workspace is null or p_project is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_INPUT'; end if;
 -- The actor comes exclusively from the authenticated API, never browser JSON.
 if p_command='check' then
  if p_key is null or p_user is not null then raise exception 'SERVICE_KEY_REQUIRED'; end if;
 else
  if p_user is null or p_key is not null then raise exception 'HUMAN_SESSION_REQUIRED'; end if;
  select role into v_role from public.workspace_members where workspace_id=p_workspace and user_id=p_user for share;
  if v_role is null or v_role not in ('owner','admin') then raise exception 'ADMIN_REQUIRED'; end if;
 end if;
 perform 1 from public.projects where id=p_project and workspace_id=p_workspace
  and (archived_at is null or p_command in ('list','revoke')) for share;
 if not found then raise exception 'PROJECT_UNAVAILABLE'; end if;
 if p_command='list' then
  return jsonb_build_object(
   'grants',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.project_service_delegations d where d.workspace_id=p_workspace and d.project_id=p_project),'[]'::jsonb),
   'keys',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',left(name,160),'scopes',scopes,'expiresAt',expires_at)) from public.workspace_api_keys where workspace_id=p_workspace and revoked_at is null and (expires_at is null or expires_at>clock_timestamp())),'[]'::jsonb),
   'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',left(nom,160))) from public.hybrid_nodes where workspace_id=p_workspace and type in ('AGENT_IA','SOFTWARE_MCP')),'[]'::jsonb)
  );
 end if;
 v_id := (p_input->>'grantId')::uuid;
 if v_id is null then raise exception 'INVALID_INPUT'; end if;
 -- Serialize creation/replay even when the row does not exist yet.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text,0));
 select * into g from public.project_service_delegations where id=v_id for update;
 if found and (g.workspace_id<>p_workspace or g.project_id<>p_project) then raise exception 'GRANT_UNAVAILABLE'; end if;
 if p_command='revoke' then
  if g.id is null then raise exception 'GRANT_UNAVAILABLE'; end if;
  if (p_input->>'expectedVersion') is null then raise exception 'VERSION_REQUIRED'; end if;
  if g.revoked_at is not null then
   if (p_input->>'expectedVersion')::integer not in (g.version,g.version-1) then raise exception 'STALE_GRANT'; end if;
   return jsonb_build_object('grant',to_jsonb(g));
  end if;
  if (p_input->>'expectedVersion')::integer<>g.version then raise exception 'STALE_GRANT'; end if;
  update public.project_service_delegations set revoked_at=clock_timestamp(),version=version+1 where id=g.id returning * into g;
  insert into public.project_service_delegation_audit(grant_id,actor_id,kind) values(g.id,p_user,'revoked');
  return jsonb_build_object('grant',to_jsonb(g));
 elsif p_command='create' then
  if p_input->>'expiresAt' is null or p_input->>'apiKeyId' is null or p_input->>'nodeId' is null
   or jsonb_typeof(p_input->'actions') is distinct from 'array' or jsonb_typeof(p_input->'target') is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  v_exp := (p_input->>'expiresAt')::timestamptz;
  select array_agg(distinct a order by a) into v_actions from jsonb_array_elements_text(p_input->'actions') a;
  if coalesce(cardinality(v_actions),0)=0 or not(v_actions <@ array['execution:read','step:execute','voice:assign','voice:resolve']::text[]) then raise exception 'INVALID_ACTION'; end if;
  if (select count(*) from jsonb_object_keys(p_input->'target'))<>3 or
   coalesce(p_input#>>'{target,appId}','')!~'^[a-z][a-z0-9-]{1,63}$' or
   coalesce(p_input#>>'{target,workspaceId}','')!~'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' or
   coalesce(p_input#>>'{target,resourceId}','')!~'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then raise exception 'INVALID_TARGET'; end if;
  if g.id is not null then
   if g.granted_by<>p_user or g.api_key_id<>(p_input->>'apiKeyId')::uuid or g.node_id<>(p_input->>'nodeId')::uuid
    or g.target<>p_input->'target' or g.actions<>v_actions or g.expires_at<>v_exp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   if g.revoked_at is not null then raise exception 'GRANT_REVOKED'; end if;
  end if;
  select * into k from public.workspace_api_keys where id=(p_input->>'apiKeyId')::uuid and workspace_id=p_workspace for share;
  if k.id is null then raise exception 'KEY_UNAVAILABLE'; end if;
  perform 1 from public.hybrid_nodes where id=(p_input->>'nodeId')::uuid and workspace_id=p_workspace and type in ('AGENT_IA','SOFTWARE_MCP') for share;
  if not found then raise exception 'NODE_UNAVAILABLE'; end if;
  v_now:=clock_timestamp();
  if k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=v_now) then raise exception 'KEY_UNAVAILABLE'; end if;
  if ('execution:read'=any(v_actions) and (('execution:read'=any(k.scopes)) is not true)) or ('step:execute'=any(v_actions) and (('node:run'=any(k.scopes)) is not true)) or ('voice:assign'=any(v_actions) and (('voice:assign'=any(k.scopes)) is not true)) or ('voice:resolve'=any(v_actions) and (('voice:resolve'=any(k.scopes)) is not true)) then raise exception 'KEY_SCOPE_REQUIRED'; end if;
  if v_actions && array['voice:assign','voice:resolve']::text[] then
   if p_input#>>'{target,appId}' is distinct from 'chat-vocal' then raise exception 'INVALID_TARGET'; end if;
   perform 1 from public.hybrid_nodes n join public.bot_profiles b on b.id=n.id and b.workspace_id=n.workspace_id
    where n.id=(p_input->>'nodeId')::uuid and n.workspace_id=p_workspace and n.type='AGENT_IA' and b.enabled is true for share of n,b;
   if not found then raise exception 'NODE_UNAVAILABLE'; end if;
  end if;
  if v_exp<=v_now or v_exp>v_now+interval '30 days' or (k.expires_at is not null and v_exp>k.expires_at) then raise exception 'INVALID_EXPIRATION'; end if;
  if g.id is null then
   insert into public.project_service_delegations(id,workspace_id,project_id,api_key_id,node_id,target,actions,granted_by,expires_at)
    values(v_id,p_workspace,p_project,k.id,(p_input->>'nodeId')::uuid,p_input->'target',v_actions,p_user,v_exp) returning * into g;
   insert into public.project_service_delegation_audit(grant_id,actor_id,kind) values(g.id,p_user,'created');
  end if;
  if g.expires_at<=clock_timestamp() then raise exception 'GRANT_EXPIRED'; end if;
  return jsonb_build_object('grant',to_jsonb(g));
 elsif p_command='check' then
  if g.id is null or g.api_key_id<>p_key or g.revoked_at is not null then raise exception 'GRANT_UNAVAILABLE'; end if;
  if p_input->'target' is null or g.target<>p_input->'target' then raise exception 'TARGET_MISMATCH'; end if;
  if p_input->>'action' is null or not((p_input->>'action')=any(g.actions)) then raise exception 'ACTION_FORBIDDEN'; end if;
  select role into v_role from public.workspace_members where workspace_id=p_workspace and user_id=g.granted_by for share;
  if v_role is null or v_role not in ('owner','admin') then raise exception 'GRANTOR_REVOKED'; end if;
  select * into k from public.workspace_api_keys where id=p_key and workspace_id=p_workspace for share;
  if k.id is null then raise exception 'KEY_UNAVAILABLE'; end if;
  if ((case when p_input->>'action'='step:execute' then 'node:run' else p_input->>'action' end)=any(k.scopes)) is not true then raise exception 'KEY_SCOPE_REQUIRED'; end if;
  perform 1 from public.hybrid_nodes where id=g.node_id and workspace_id=p_workspace and type in ('AGENT_IA','SOFTWARE_MCP') for share;
  if not found then raise exception 'NODE_UNAVAILABLE'; end if;
  if p_input->>'action' in ('voice:assign','voice:resolve') then
   if p_input ? 'runId' or p_input ? 'runVersion' or p_input ? 'stepId' then raise exception 'INVALID_INPUT'; end if;
   if p_input#>>'{target,appId}' is distinct from 'chat-vocal' then raise exception 'INVALID_TARGET'; end if;
   if (p_input->>'nodeId') is null or (p_input->>'nodeId')::uuid is distinct from g.node_id then raise exception 'NODE_UNAVAILABLE'; end if;
   perform 1 from public.hybrid_nodes n join public.bot_profiles b on b.id=n.id and b.workspace_id=n.workspace_id
    where n.id=g.node_id and n.workspace_id=p_workspace and n.type='AGENT_IA' and b.enabled is true for share of n,b;
   if not found then raise exception 'NODE_UNAVAILABLE'; end if;
   v_now:=clock_timestamp();
   if g.expires_at<=v_now or k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=v_now) then raise exception 'GRANT_EXPIRED'; end if;
   insert into public.project_service_delegation_audit(grant_id,actor_id,kind,detail) values(g.id,p_key,'checked',jsonb_build_object('action',p_input->>'action','nodeId',g.node_id));
   v_now:=clock_timestamp();
   if g.expires_at<=v_now or (k.expires_at is not null and k.expires_at<=v_now) then raise exception 'GRANT_EXPIRED'; end if;
   -- The admin grant is the explicit project assignment; no invented membership.
   -- Canonical URL is constructed by the native API ProjectRef helper, not SQL.
   return jsonb_build_object('audience','organigrad.project-service-delegation.v1','allowed',true,'grantId',g.id,'grantVersion',g.version,
    'projectId',p_project,'workspaceId',p_workspace,'nodeId',g.node_id,'action',p_input->>'action','target',g.target,
    'project',jsonb_build_object('sourceApp','organigrad','projectId',p_project,'workspaceId',p_workspace),
    'checkedAt',v_now,'expiresAt',least(v_now+interval '5 seconds',g.expires_at,k.expires_at),'recheckBeforeEffect',true);
  end if;
  if p_input->>'runId' is null then raise exception 'INVALID_INPUT'; end if;
  if p_input->>'action'='step:execute' and p_input->>'runVersion' is null then raise exception 'RUN_VERSION_REQUIRED'; end if;
  if p_input->>'action'='execution:read' and (p_input ? 'runVersion' or p_input ? 'stepId') then raise exception 'INVALID_INPUT'; end if;
  select e.version,e.state,c.project_id into r from public.circuit_executions e join public.team_circuits c on c.id=e.circuit_id and c.workspace_id=e.workspace_id
   where e.id=(p_input->>'runId')::uuid and e.workspace_id=p_workspace and c.project_id=p_project for share of e,c;
  if not found then raise exception 'RUN_UNAVAILABLE'; end if;
  if (r.state->>'version')::integer is distinct from r.version or
   r.state#>>'{definition,project,projectId}' is distinct from p_project::text or
   r.state#>>'{definition,project,workspaceId}' is distinct from p_workspace::text or
   r.state#>>'{definition,project,sourceApp}' is distinct from 'organigrad' then raise exception 'STALE_EXECUTION'; end if;
  if p_input->>'action'='step:execute' then
   if r.version is distinct from (p_input->>'runVersion')::integer then raise exception 'STALE_EXECUTION'; end if;
   if p_input->>'stepId' is null or r.state->>'currentStepId' is distinct from p_input->>'stepId' or r.state->>'status' is distinct from 'ready' then raise exception 'STEP_NOT_READY'; end if;
   select s into v_step from jsonb_array_elements(r.state#>'{definition,steps}') s where s->>'id'=p_input->>'stepId';
   if v_step is null or v_step->>'assigneeId' is distinct from g.node_id::text or v_step->>'kind' is null or v_step->>'kind' not in ('watch','writing','visual_brief','generation','control') then raise exception 'STEP_FORBIDDEN'; end if;
  end if;
  v_now:=clock_timestamp();
  if g.expires_at<=v_now or k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=v_now) then raise exception 'GRANT_EXPIRED'; end if;
  insert into public.project_service_delegation_audit(grant_id,actor_id,kind,detail)
   values(g.id,p_key,'checked',jsonb_build_object('action',p_input->>'action','runId',p_input->>'runId','currentRunVersion',r.version)||case when p_input->>'action'='step:execute' then jsonb_build_object('runVersion',p_input->'runVersion','stepId',p_input->>'stepId') else '{}'::jsonb end);
  v_now:=clock_timestamp();
  if g.expires_at<=v_now or (k.expires_at is not null and k.expires_at<=v_now) then raise exception 'GRANT_EXPIRED'; end if;
  -- A decision at this instant, NOT a bearer capability or permission to dispatch.
  v_result:=jsonb_build_object('audience','organigrad.project-service-delegation.v1','allowed',true,'grantId',g.id,'grantVersion',g.version,'projectId',p_project,'workspaceId',p_workspace,
   'action',p_input->>'action','target',g.target,'project',r.state#>'{definition,project}','runId',p_input->>'runId',
   'checkedAt',v_now,'expiresAt',least(v_now+interval '5 seconds',g.expires_at,k.expires_at),'recheckBeforeEffect',true);
  v_result:=v_result||case when p_input->>'action'='step:execute' then jsonb_build_object('runVersion',p_input->'runVersion','stepId',p_input->>'stepId') else jsonb_build_object('currentRunVersion',r.version) end;
  return v_result;
 end if;
 raise exception 'INVALID_COMMAND';
end $$;
revoke all on function public.project_service_delegation_command(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.project_service_delegation_command(uuid,uuid,uuid,uuid,text,jsonb) to service_role;

-- Explicit technical voice scopes, never added to default keys.
create or replace function public.create_scoped_workspace_api_key(p_workspace_id uuid, p_name text, p_scopes text[])
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
    allowed text[] := array['graph:read', 'node:read', 'node:run', 'execution:read', 'bots:export', 'voice:assign', 'voice:resolve'];
begin
    if coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner', 'admin') then
        raise exception 'forbidden';
    end if;
    if p_scopes is null or array_length(p_scopes, 1) is null then
        raise exception 'scopes requis' using errcode = '22023';
    end if;
    if not (p_scopes <@ allowed) then
        raise exception 'scope non technique refuse' using errcode = '22023';
    end if;

    raw    := 'ok_' || encode(extensions.gen_random_bytes(16), 'hex');
    prefix := substring(raw from 1 for 11);
    hashed := encode(extensions.digest(raw, 'sha256'), 'hex');

    insert into public.workspace_api_keys
        (workspace_id, name, key_hash, key_prefix, created_by, scopes)
    values
        (p_workspace_id, p_name, hashed, prefix, auth.uid(), p_scopes)
    returning workspace_api_keys.id, workspace_api_keys.created_at
        into  new_id, created;

    return query select new_id, raw, prefix, created;
end;
$function$;

revoke execute on function public.create_scoped_workspace_api_key(uuid, text, text[]) from public, anon;
grant execute on function public.create_scoped_workspace_api_key(uuid, text, text[]) to authenticated;
