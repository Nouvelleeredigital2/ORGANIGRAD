import { it,expect,vi } from 'vitest';
import { OrchestratorClient } from './orchestratorService';
it('charge les circuits avec la session et le workspace courants',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({circuits:[]})));
 const client=new OrchestratorClient({fetchImpl:fetcher,getUserAuth:async()=>({token:'test-session',workspaceId:'test-workspace'})});
 expect(await client.fetchCircuits()).toEqual([]);
 expect(fetcher.mock.calls[0]![1].headers).toMatchObject({authorization:'Bearer test-session','x-workspace-id':'test-workspace'});
});
