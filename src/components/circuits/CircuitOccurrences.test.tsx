import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { CircuitOccurrences } from './CircuitOccurrences';
afterEach(cleanup);
it('propose un rattrapage explicite et rejoue la même occurrence après une réponse perdue',async()=>{
 const client={fetchCircuitOccurrences:vi.fn().mockResolvedValue([{id:'occurrence',scheduledFor:'2026-09-07T05:00:00Z',definitionVersion:2,status:'missed',runId:null,recoveredRunId:null}]),recoverCircuitOccurrence:vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({id:'run'})};
 render(<CircuitOccurrences client={client} circuitId="circuit"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Rattraper cette occurrence'}));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Rattraper cette occurrence'}));
 await screen.findByText('Manquée — dossier de rattrapage créé');
 expect(client.recoverCircuitOccurrence.mock.calls).toEqual([['circuit','occurrence'],['circuit','occurrence']]);
 expect(screen.queryByRole('button',{name:'Rattraper cette occurrence'})).toBeNull();
});
it('ne présente pas une lecture en échec comme un historique vide',async()=>{
 const client={fetchCircuitOccurrences:vi.fn().mockRejectedValue(new Error('network')),recoverCircuitOccurrence:vi.fn()};
 render(<CircuitOccurrences client={client} circuitId="circuit"/>);
 await screen.findByRole('alert');
 expect(screen.queryByText('Aucune occurrence enregistrée.')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Actualiser les occurrences'}));
 await waitFor(()=>expect(client.fetchCircuitOccurrences).toHaveBeenCalledTimes(2));
});
