import { it,expect,vi } from 'vitest';
import { OrchestratorClient } from './orchestratorService';
it('charge les circuits avec la session et le workspace courants',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({circuits:[]})));
 const client=new OrchestratorClient({fetchImpl:fetcher,getUserAuth:async()=>({token:'test-session',workspaceId:'test-workspace'})});
 expect(await client.fetchCircuits()).toEqual([]);
 expect(fetcher.mock.calls[0]![1].headers).toMatchObject({authorization:'Bearer test-session','x-workspace-id':'test-workspace'});
});
it('demande les prochaines dates sans enregistrer ni activer le circuit',async()=>{
 const schedule={weekday:1,hour:7,minute:0,timeZone:'Europe/Paris'};
 const fetcher=vi.fn().mockResolvedValue(Response.json({occurrences:['2026-10-26T06:00:00.000Z']}));
 const client=new OrchestratorClient({fetchImpl:fetcher,getUserAuth:async()=>({token:'session',workspaceId:'workspace'})});
 expect(await client.previewCircuitSchedule(schedule)).toEqual(['2026-10-26T06:00:00.000Z']);
 expect(fetcher.mock.calls[0]![0]).toContain('/circuits/preview-schedule');
 expect(fetcher.mock.calls[0]![1]).toMatchObject({method:'POST',body:JSON.stringify(schedule),headers:{authorization:'Bearer session','x-workspace-id':'workspace'}});
});
it('refuse les dates mal formées reçues de l’aperçu',async()=>{
 const client=new OrchestratorClient({fetchImpl:vi.fn().mockResolvedValue(Response.json({occurrences:['demain']})),getUserAuth:async()=>({token:'session',workspaceId:'workspace'})});
 await expect(client.previewCircuitSchedule({weekday:1,hour:7,minute:0,timeZone:'Europe/Paris'})).rejects.toThrow();
});
it('refuse un fuseau invalide avant tout appel API',async()=>{
 const fetcher=vi.fn(),client=new OrchestratorClient({fetchImpl:fetcher,getUserAuth:async()=>({token:'session',workspaceId:'workspace'})});
 await expect(client.previewCircuitSchedule({weekday:1,hour:7,minute:0,timeZone:'Paris/invalide'})).rejects.toThrow();
 expect(fetcher).not.toHaveBeenCalled();
});
