-- Local candidate: discover existing read delegations, never grant new rights.
-- Depends on project_service_delegations. No second project registry.
create function public.list_project_service_targets(
 p_workspace uuid,p_key uuid,p_app text,p_native_workspace text,p_after uuid default null,p_limit integer default 25
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_workspace is null or p_key is null or p_app is null or p_native_workspace is null
  or p_app !~ '^[a-z][a-z0-9-]{1,63}$' or p_native_workspace !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
  or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'INVALID_TARGET_QUERY'; end if;
 with visible as materialized (
  select g.id,jsonb_build_object('grantId',g.id,'projectId',p.id,'workspaceId',p.workspace_id,
   'name',left(p.name,160),'target',g.target,'expiresAt',least(g.expires_at,k.expires_at)) as item
  from public.project_service_delegations g
  join public.workspace_api_keys k on k.id=g.api_key_id and k.workspace_id=g.workspace_id
  join public.projects p on p.id=g.project_id and p.workspace_id=g.workspace_id
  join public.hybrid_nodes n on n.id=g.node_id and n.workspace_id=g.workspace_id
  join public.workspace_members m on m.user_id=g.granted_by and m.workspace_id=g.workspace_id
  where g.workspace_id=p_workspace and k.id=p_key and g.revoked_at is null
   and g.expires_at>clock_timestamp() and k.revoked_at is null and (k.expires_at is null or k.expires_at>clock_timestamp())
   and p.archived_at is null and m.role in ('owner','admin') and n.type in ('AGENT_IA','SOFTWARE_MCP')
   and ('execution:read'=any(g.actions)) is true and ('execution:read'=any(k.scopes)) is true
   and g.target->>'appId'=p_app and g.target->>'workspaceId'=p_native_workspace
   and (p_after is null or g.id>p_after)
  order by g.id limit p_limit+1
 ) select jsonb_build_object(
  'items',coalesce((select jsonb_agg(selected.item order by selected.id) from (select * from visible order by id limit p_limit) selected),'[]'::jsonb),
  'nextCursor',case when (select count(*) from visible)>p_limit then (select id from visible order by id offset p_limit-1 limit 1) else null end
 ) into result;
 return result;
end $$;
revoke all on function public.list_project_service_targets(uuid,uuid,text,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_project_service_targets(uuid,uuid,text,text,uuid,integer) to service_role;

-- Vocal overload: explicit action and native voice, preserving the original read contract.
-- Depends on project_service_delegations. No second project registry.
create function public.list_project_service_targets(
 p_workspace uuid,p_key uuid,p_app text,p_native_workspace text,p_after uuid,p_limit integer,p_action text,p_resource text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_workspace is null or p_key is null or p_app is null or p_native_workspace is null
  or p_app !~ '^[a-z][a-z0-9-]{1,63}$' or p_native_workspace !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
  or p_action is null or p_action not in ('voice:assign','voice:resolve') or p_app<>'chat-vocal'
  or p_resource is null or p_resource !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'INVALID_TARGET_QUERY'; end if;
 with visible as materialized (
  select g.id,jsonb_build_object('grantId',g.id,'projectId',p.id,'workspaceId',p.workspace_id,
   'name',left(p.name,160),'nodeId',n.id,'nodeName',left(n.nom,160),'action',p_action,'target',g.target,'expiresAt',least(g.expires_at,k.expires_at)) as item
  from public.project_service_delegations g
  join public.workspace_api_keys k on k.id=g.api_key_id and k.workspace_id=g.workspace_id
  join public.projects p on p.id=g.project_id and p.workspace_id=g.workspace_id
  join public.hybrid_nodes n on n.id=g.node_id and n.workspace_id=g.workspace_id
  join public.bot_profiles b on b.id=n.id and b.workspace_id=n.workspace_id and b.enabled=true
  join public.workspace_members m on m.user_id=g.granted_by and m.workspace_id=g.workspace_id
  where g.workspace_id=p_workspace and k.id=p_key and g.revoked_at is null
   and g.expires_at>clock_timestamp() and k.revoked_at is null and (k.expires_at is null or k.expires_at>clock_timestamp())
   and p.archived_at is null and m.role in ('owner','admin') and n.type='AGENT_IA'
   and (p_action=any(g.actions)) is true and (p_action=any(k.scopes)) is true
   and g.target->>'appId'=p_app and g.target->>'workspaceId'=p_native_workspace
   and g.target->>'resourceId'=p_resource
   and (p_after is null or g.id>p_after)
  order by g.id limit p_limit+1
 ) select jsonb_build_object(
  'items',coalesce((select jsonb_agg(selected.item order by selected.id) from (select * from visible order by id limit p_limit) selected),'[]'::jsonb),
  'nextCursor',case when (select count(*) from visible)>p_limit then (select id from visible order by id offset p_limit-1 limit 1) else null end
 ) into result;
 return result;
end $$;
revoke all on function public.list_project_service_targets(uuid,uuid,text,text,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.list_project_service_targets(uuid,uuid,text,text,uuid,integer,text,text) to service_role;
