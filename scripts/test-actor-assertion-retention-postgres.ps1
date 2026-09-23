$ErrorActionPreference = 'Stop'
$container = 'organigrad-actor-retention-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$root = Split-Path -Parent $PSScriptRoot
$migration = Get-Content -Raw (Join-Path $root 'supabase/migrations/20260924120000_actor_assertion_requests.sql')
$checks = @'
do $$begin
 if not exists(select 1 from pg_indexes where schemaname='public' and tablename='actor_assertion_requests' and indexdef ilike '%(expires_at)%') then
  raise exception 'expires_at index missing';
 end if;
end$$;
insert into public.actor_assertion_requests(request_id,purpose,http_method,route,body_sha256,expires_at)
select gen_random_uuid(),'circuit-runs-list','GET','/api/link-bridge/circuit-runs',repeat('a',64),clock_timestamp()-interval '1 minute'
from generate_series(1,130);
insert into public.actor_assertion_requests(request_id,purpose,http_method,route,body_sha256,expires_at)
values('11111111-1111-4111-8111-111111111111','circuit-runs-list','GET','/api/link-bridge/circuit-runs',repeat('b',64),clock_timestamp()+interval '1 minute');
do $$begin
 if not public.reserve_actor_assertion_request('22222222-2222-4222-8222-222222222222','circuit-runs-list','GET','/api/link-bridge/circuit-runs',repeat('c',64),null,clock_timestamp()+interval '1 minute') then raise exception 'first reservation rejected'; end if;
 if (select count(*) from public.actor_assertion_requests where expires_at<=clock_timestamp()) <> 2 then raise exception 'purge is not bounded to 128 rows'; end if;
 if (select count(*) from public.actor_assertion_requests where expires_at>clock_timestamp()) <> 2 then raise exception 'live reservation damaged'; end if;
end$$;
do $$begin
 if public.reserve_actor_assertion_request('22222222-2222-4222-8222-222222222222','circuit-runs-list','GET','/api/link-bridge/circuit-runs',repeat('c',64),null,clock_timestamp()+interval '1 minute') then raise exception 'replay accepted'; end if;
 if (select count(*) from public.actor_assertion_requests where expires_at<=clock_timestamp()) <> 0 then raise exception 'expired retention not drained by bounded calls'; end if;
 if (select count(*) from public.actor_assertion_requests where expires_at>clock_timestamp()) <> 2 then raise exception 'live reservation damaged'; end if;
end$$;
set role service_role;
do $$begin
 begin
  perform public.reserve_actor_assertion_request(gen_random_uuid(),'circuit-runs-list','GET','/api/link-bridge/circuit-runs',repeat('d',64),null,clock_timestamp()+interval '1 minute');
  raise exception 'service_role unexpectedly executed reservation';
 exception when insufficient_privilege then null; end;
end$$;
reset role;
'@
try {
  docker run -d --name $container -e POSTGRES_PASSWORD=test postgres:16 | Out-Null
  for ($i=0; $i -lt 30; $i++) {
    docker exec $container pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
  "create role anon; create role authenticated; create role service_role;`n$migration`n$checks" | docker exec -i $container psql -v ON_ERROR_STOP=1 -U postgres
  if ($LASTEXITCODE -ne 0) { throw 'Actor assertion retention validation failed' }
} finally {
  docker rm -f $container 2>$null | Out-Null
}
