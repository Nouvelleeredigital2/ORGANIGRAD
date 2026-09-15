import { act,render,screen,fireEvent,waitFor } from '@testing-library/react';
import { it,expect,vi } from 'vitest';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import type { CircuitRun } from '../../types/circuit';
import { CircuitRunCard } from './CircuitRunCard';
const id='11111111-1111-4111-8111-111111111111';
const subject={id:'subject',sourceApp:'atelier-orvion',canonicalUrl:'https://example.org/subject',kind:'subject' as const,version:1};
const definition=CircuitDefinitionSchema.parse({name:'Veille Nature',project:{projectId:id,workspaceId:id,sourceApp:'organigrad',canonicalUrl:'https://example.org'},steps:[{id:'choose',kind:'selection',assigneeId:id,instructions:'Choisir'},{id:'final',kind:'approval',assigneeId:id,instructions:'Valider'}]});
const run:CircuitRun={id,definition,definitionVersion:1,version:2,currentStepId:'choose',status:'waiting_approval',outputs:{watch:[subject]},history:[]};
it('transmet la référence du sujet choisi et conserve la clé après une réponse perdue',async()=>{
 const decide=vi.fn().mockRejectedValueOnce(new Error('Network')).mockResolvedValue(undefined);
 render(<CircuitRunCard run={run} userId={id} admin={false} onDecision={decide} onControl={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Sujet à retenir'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:'Retenir ce sujet'}));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Retenir ce sujet'}));
 await waitFor(()=>expect(decide).toHaveBeenCalledTimes(2));
 expect(decide.mock.calls[0]?.[0]).toMatchObject({selectedArtifact:subject,expectedVersion:2,channel:'organigrad'});
 expect(decide.mock.calls[1]?.[0].idempotencyKey).toBe(decide.mock.calls[0]?.[0].idempotencyKey);
});
it('ne propose pas la validation à une autre personne',()=>{
 render(<CircuitRunCard run={run} userId="other" admin={false} onDecision={vi.fn()} onControl={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'Retenir ce sujet'})).toBeNull();
 expect(screen.getByText('En attente du responsable désigné.')).toBeDefined();
});
it('ne conserve pas le choix par index après changement de version du dossier',async()=>{
 const decide=vi.fn().mockResolvedValue(undefined);
 const view=render(<CircuitRunCard run={run} userId={id} admin={false} onDecision={decide} onControl={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Sujet à retenir'),{target:{value:'0'}});
 const revised={...run,version:3,outputs:{watch:[{...subject,id:'different-subject',version:2}]}};
 view.rerender(<CircuitRunCard run={revised} userId={id} admin={false} onDecision={decide} onControl={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retenir ce sujet'}));
 expect(decide).not.toHaveBeenCalled();
 expect(await screen.findByRole('alert')).toHaveTextContent('Choisissez le sujet à retenir.');
});
it('une réponse perdue sur un autre dossier ne pollue pas le nouveau',async()=>{
 let reject!:(error:Error)=>void;
 const decide=vi.fn(()=>new Promise((_resolve,no)=>{reject=no;}));
 const view=render(<CircuitRunCard run={run} userId={id} admin={false} onDecision={decide} onControl={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Sujet à retenir'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:'Retenir ce sujet'}));
 view.rerender(<CircuitRunCard run={{...run,id:'other-run'}} userId={id} admin={false} onDecision={decide} onControl={vi.fn()}/>);
 await act(async()=>reject(new Error('Lost response')));
 expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByLabelText('Sujet à retenir')).toHaveValue('');
});
