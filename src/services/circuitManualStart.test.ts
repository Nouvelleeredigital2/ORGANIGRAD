import { expect,it,vi } from 'vitest';
import { OrchestratorClient } from './orchestratorService';
it('starts through the authenticated API with the caller idempotency key',async()=>{
 const fetchImpl=vi.fn().mockResolvedValue(new Response(JSON.stringify({run:{id:'run'}}),{status:201}));
 const client=new OrchestratorClient({baseUrl:'https://organigrad.example/api',fetchImpl,getUserAuth:async()=>({token:'user-session',workspaceId:'workspace'})});
 expect(await client.startCircuitRun('circuit','request-key')).toEqual({id:'run'});
 const [url,options]=fetchImpl.mock.calls[0]!;
 expect(url).toBe('https://organigrad.example/api/circuits/circuit/runs');
 expect(options.method).toBe('POST');
 expect(JSON.parse(options.body)).toEqual({idempotencyKey:'request-key'});
 const headers=new Headers(options.headers);
 expect(headers.get('authorization')).toBe('Bearer user-session');
 expect(headers.get('x-workspace-id')).toBe('workspace');
});
