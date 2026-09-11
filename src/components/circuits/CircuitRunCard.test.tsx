import { render,screen,fireEvent,waitFor } from '@testing-library/react';
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
