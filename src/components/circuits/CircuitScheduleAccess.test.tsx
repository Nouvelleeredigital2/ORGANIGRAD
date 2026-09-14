import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { CircuitScheduleAccess } from './CircuitScheduleAccess';
afterEach(cleanup);
it('configure une autorisation sans prétendre activer le worker puis la révoque',async()=>{
 const auth={grantId:'grant',nextDueAt:'2026-09-14T05:00:00Z',expiresAt:'2026-09-26T05:00:00Z',enabled:false};
 const client={fetchCircuitSchedule:vi.fn().mockResolvedValue(null),authorizeCircuitSchedule:vi.fn().mockResolvedValue(auth),revokeCircuitSchedule:vi.fn().mockResolvedValue(undefined)};
 render(<CircuitScheduleAccess client={client} circuitId="circuit" version={2}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Autoriser pour 14 jours'}));
 await screen.findByText('Autorisation configurée');
 expect(screen.getByText(/ne démarre pas le worker/)).toBeTruthy();
 expect(client.authorizeCircuitSchedule).toHaveBeenCalledWith('circuit',expect.objectContaining({expectedVersion:2,idempotencyKey:expect.any(String)}));
 fireEvent.click(screen.getByRole('button',{name:'Révoquer l’autorisation'}));
 await waitFor(()=>expect(client.revokeCircuitSchedule).toHaveBeenCalledWith('circuit','grant'));
 await screen.findByText('Aucune autorisation configurée');
});
it('réutilise la même commande après une réponse réseau perdue',async()=>{
 const client={fetchCircuitSchedule:vi.fn().mockResolvedValue(null),authorizeCircuitSchedule:vi.fn().mockRejectedValue(new Error('network')),revokeCircuitSchedule:vi.fn()};
 render(<CircuitScheduleAccess client={client} circuitId="circuit" version={2}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Autoriser pour 14 jours'}));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Réessayer l’autorisation'}));
 await waitFor(()=>expect(client.authorizeCircuitSchedule).toHaveBeenCalledTimes(2));
 expect(client.authorizeCircuitSchedule.mock.calls[0]).toEqual(client.authorizeCircuitSchedule.mock.calls[1]);
});
