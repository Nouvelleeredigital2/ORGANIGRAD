import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { it,expect,vi } from 'vitest';
import { CircuitEditor } from './CircuitEditor';
const id='11111111-1111-4111-8111-111111111111';
const options={projects:[{name:'Nature & Tech',ref:{projectId:id,workspaceId:id,sourceApp:'organigrad',canonicalUrl:'https://example.org/project'}}],humans:[{id,name:'Laurent'}],workers:[{id,name:'Hannah'}]};
it('crée un circuit rattaché au projet réel avec validation humaine finale',async()=>{
 const save=vi.fn();render(<CircuitEditor options={options} onSave={save} onCancel={()=>{}} />);
 fireEvent.change(screen.getByLabelText('Nom du circuit'),{target:{value:'Veille du lundi'}});
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer le circuit'}));
 await waitFor(()=>expect(save).toHaveBeenCalled());
 const definition=save.mock.calls[0]![0];expect(definition.project).toEqual(options.projects[0]!.ref);
 expect(definition.steps.at(-1).kind).toBe('approval');expect(definition.steps.at(-1).validatorKind).toBe('human');
});
it('présente une erreur sans inventer de projet lorsqu’aucun n’existe',async()=>{
 const save=vi.fn();render(<CircuitEditor options={{...options,projects:[]}} onSave={save} onCancel={()=>{}} />);
 fireEvent.change(screen.getByLabelText('Nom du circuit'),{target:{value:'Veille'}});
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer le circuit'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('projet');expect(save).not.toHaveBeenCalled();
});
