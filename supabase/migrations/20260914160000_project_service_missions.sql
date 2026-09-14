-- Local candidate. A bounded catalogue of existing assigned steps, not permission
-- to bind or execute them. Consumers must recheck the current delegation on use.
create function public.list_project_service_missions(
 p_workspace uuid,p_key uuid,p_app text,p_native_workspace text,p_resource text,
 p_after_run uuid default null,p_after_grant uuid default null,p_limit integer default 25
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_workspace is null or p_key is null or p_app is null or p_native_workspace is null or p_resource is null
  or p_app !~ '^[a-z][a-z0-9-]{1,63}$'
  or p_native_workspace !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
  or p_resource !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
  or (p_after_run is null)<>(p_after_grant is null)
  or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'INVALID_MISSION_QUERY'; end if;
 with visible as materialized (
  select e.id run_id,g.id grant_id,jsonb_build_object(
   'grantId',g.id,'projectId',p.id,'workspaceId',p.workspace_id,'name',left(p.name,160),
   'nodeId',n.id,'nodeName',left(n.nom,160),'target',g.target,
   'runId',e.id,'runVersion',e.version,'circuitName',left(e.state#>>'{definition,name}',160),
   'stepId',e.state->>'currentStepId','stepKind',step.kind,
   'expiresAt',least(g.expires_at,k.expires_at)) item
  from public.project_service_delegations g
  join public.workspace_api_keys k on k.id=g.api_key_id and k.workspace_id=g.workspace_id
  join public.projects p on p.id=g.project_id and p.workspace_id=g.workspace_id
  join public.hybrid_nodes n on n.id=g.node_id and n.workspace_id=g.workspace_id
  join public.workspace_members m on m.user_id=g.granted_by and m.workspace_id=g.workspace_id
  join public.team_circuits c on c.project_id=p.id and c.workspace_id=p.workspace_id
  join public.circuit_executions e on e.circuit_id=c.id and e.workspace_id=c.workspace_id
  join lateral (
   select count(*) matches,min(s->>'assigneeId') assignee,min(s->>'kind') kind
   from jsonb_array_elements(case when jsonb_typeof(e.state#>'{definition,steps}')='array' then e.state#>'{definition,steps}' else '[]'::jsonb end) s
   where s->>'id'=e.state->>'currentStepId'
  ) step on step.matches=1 and step.assignee=g.node_id::text and step.kind in ('watch','writing','visual_brief','generation','control')
  where g.workspace_id=p_workspace and k.id=p_key and g.revoked_at is null
   and g.expires_at>clock_timestamp() and k.revoked_at is null and (k.expires_at is null or k.expires_at>clock_timestamp())
   and p.archived_at is null and m.role in ('owner','admin') and n.type in ('AGENT_IA','SOFTWARE_MCP')
   and ('step:execute'=any(g.actions)) is true and ('node:run'=any(k.scopes)) is true
   and g.target->>'appId'=p_app and g.target->>'workspaceId'=p_native_workspace and g.target->>'resourceId'=p_resource
   and e.state->>'status'='ready' and e.state->>'version'=e.version::text
   and e.state#>>'{definition,project,projectId}'=p.id::text
   and e.state#>>'{definition,project,workspaceId}'=p.workspace_id::text
   and e.state#>>'{definition,project,sourceApp}'='organigrad'
   and (p_after_run is null or (e.id,g.id)>(p_after_run,p_after_grant))
  order by e.id,g.id limit p_limit+1
 ) select jsonb_build_object(
  'items',coalesce((select jsonb_agg(selected.item order by selected.run_id,selected.grant_id) from (select * from visible order by run_id,grant_id limit p_limit) selected),'[]'::jsonb),
  'nextCursor',case when (select count(*) from visible)>p_limit then (select jsonb_build_object('runId',run_id,'grantId',grant_id) from visible order by run_id,grant_id offset p_limit-1 limit 1) else null end
 ) into result;
 return result;
end $$;
revoke all on function public.list_project_service_missions(uuid,uuid,text,text,text,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_project_service_missions(uuid,uuid,text,text,text,uuid,uuid,integer) to service_role;
