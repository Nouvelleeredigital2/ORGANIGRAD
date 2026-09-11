import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
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
it('affiche les dates dans le fuseau choisi sans activer ni enregistrer',async()=>{
 const preview=vi.fn().mockResolvedValue(['2026-10-19T05:00:00.000Z','2026-10-26T06:00:00.000Z']),save=vi.fn();
 render(<CircuitEditor options={options} onSave={save} onCancel={()=>{}} onPreviewSchedule={preview}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'Prévoir un rendez-vous hebdomadaire'}));
 fireEvent.click(screen.getByRole('button',{name:'Voir les prochaines dates'}));
 expect(await screen.findByText(/26 octobre 2026/)).toHaveTextContent('07:00');
 expect(screen.getByText(/19 octobre 2026/)).toHaveTextContent('07:00');
 expect(screen.getByRole('region',{name:'Prochaines occurrences'})).toHaveTextContent('Europe/Paris');
 expect(save).not.toHaveBeenCalled();
});
it('signale un fuseau invalide sans demander de dates',async()=>{
 const preview=vi.fn();render(<CircuitEditor options={options} onSave={()=>{}} onCancel={()=>{}} onPreviewSchedule={preview}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'Prévoir un rendez-vous hebdomadaire'}));
 fireEvent.change(screen.getByLabelText('Fuseau'),{target:{value:'Paris/invalide'}});
 fireEvent.click(screen.getByRole('button',{name:'Voir les prochaines dates'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('fuseau');expect(preview).not.toHaveBeenCalled();
});
it('ignore une réponse tardive après modification de l’horaire',async()=>{
 let finish!:(dates:string[])=>void;
 const preview=vi.fn().mockImplementationOnce(()=>new Promise<string[]>(resolve=>{finish=resolve;})).mockResolvedValue(['2026-10-26T08:00:00.000Z']);
 render(<CircuitEditor options={options} onSave={()=>{}} onCancel={()=>{}} onPreviewSchedule={preview}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'Prévoir un rendez-vous hebdomadaire'}));
 fireEvent.click(screen.getByRole('button',{name:'Voir les prochaines dates'}));
 fireEvent.change(screen.getByLabelText('Heure'),{target:{value:'09:00'}});
 fireEvent.click(screen.getByRole('button',{name:'Voir les prochaines dates'}));
 expect(await screen.findByText(/26 octobre 2026/)).toHaveTextContent('09:00');
 await act(async()=>finish(['2026-10-19T05:00:00.000Z']));
 expect(screen.queryByText(/19 octobre/)).not.toBeInTheDocument();
});
it('présente une erreur d’aperçu et permet de réessayer',async()=>{
 const preview=vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(['2026-10-26T06:00:00.000Z']);
 render(<CircuitEditor options={options} onSave={()=>{}} onCancel={()=>{}} onPreviewSchedule={preview}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'Prévoir un rendez-vous hebdomadaire'}));
 fireEvent.click(screen.getByRole('button',{name:'Voir les prochaines dates'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Aperçu indisponible');
 fireEvent.click(screen.getByRole('button',{name:'Voir les prochaines dates'}));
 expect(await screen.findByText(/26 octobre 2026/)).toBeInTheDocument();
});
it('présente une erreur sans inventer de projet lorsqu’aucun n’existe',async()=>{
 const save=vi.fn();render(<CircuitEditor options={{...options,projects:[]}} onSave={save} onCancel={()=>{}} />);
 fireEvent.change(screen.getByLabelText('Nom du circuit'),{target:{value:'Veille'}});
 fireEvent.click(screen.getByRole('button',{name:'Enregistrer le circuit'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('projet');expect(save).not.toHaveBeenCalled();
});
