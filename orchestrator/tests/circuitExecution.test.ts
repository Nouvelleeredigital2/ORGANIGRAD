import { describe,it,expect } from 'vitest';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import { startExecution, completeStep, decideStep, controlExecution, CircuitError, nextOccurrences } from '../src/orchestration/circuits.js';
const person='11111111-1111-4111-8111-111111111111';
const definition=CircuitDefinitionSchema.parse({name:'Veille',project:{projectId:person,workspaceId:person,sourceApp:'organigrad',canonicalUrl:'https://example.org/project'},steps:[{id:'watch',kind:'watch',assigneeId:person,instructions:'Chercher'},{id:'validate',kind:'approval',assigneeId:person,instructions:'Valider',correctionStepId:'watch'}]});
const artifact={id:'article1',sourceApp:'atelier-orvion',canonicalUrl:'https://example.org/doc',version:1,kind:'watch' as const};
const actor={id:person,kind:'human' as const};
describe('exécutions séparées et versions',()=>{
 it('conserve une sortie même avec un identifiant ressemblant à une propriété native',()=>{
  const def=CircuitDefinitionSchema.parse({...definition,steps:[{...definition.steps[0],id:'__proto__'},{...definition.steps[1],correctionStepId:'__proto__'}]});
  const run=completeStep(startExecution('a',def,1),'__proto__',1,[artifact]);
  expect(JSON.parse(JSON.stringify(run.outputs))['__proto__']).toEqual([artifact]);
 });
 it('ne termine jamais un dossier vide et refuse un faux visuel',()=>{
  const empty=CircuitDefinitionSchema.parse({...definition,steps:[{...definition.steps[0],kind:'approval'},definition.steps[1]]});
  const first=decideStep(startExecution('a',empty,1),{choice:'approve',expectedVersion:1,stepId:'watch',channel:'organigrad',idempotencyKey:person,feedback:''},actor);
  expect(()=>decideStep(first,{choice:'approve',expectedVersion:2,stepId:'validate',channel:'organigrad',idempotencyKey:'22222222-2222-4222-8222-222222222222',feedback:''},actor)).toThrow('DOSSIER_INCOMPLETE');
  const image=CircuitDefinitionSchema.parse({...definition,steps:[{...definition.steps[0],kind:'generation'},definition.steps[1]]});
  expect(()=>completeStep(startExecution('image',image,1),'watch',1,[{...artifact,kind:'review'}])).toThrow('INVALID_STEP_OUTPUT');
 });
 it('sélectionne uniquement un sujet réellement présent dans ce dossier',()=>{
  const def=CircuitDefinitionSchema.parse({...definition,steps:[definition.steps[0],{id:'choose',kind:'selection',assigneeId:person,instructions:'Choisir'},definition.steps[1]]});
  const subject={...artifact,id:'subject1',kind:'subject' as const};
  const run=completeStep(startExecution('a',def,1),'watch',1,[artifact,subject]);
  const decision={choice:'approve' as const,expectedVersion:2,stepId:'choose',channel:'link' as const,idempotencyKey:person,feedback:''};
  expect(()=>decideStep(run,decision,actor)).toThrow('SUBJECT_REQUIRED');
  expect(()=>decideStep(run,{...decision,selectedArtifact:{...subject,version:2}},actor)).toThrow('SUBJECT_NOT_IN_DOSSIER');
  expect(decideStep(run,{...decision,selectedArtifact:subject},actor).outputs.choose).toEqual([subject]);
 });
 it('pause, reprend sans perdre les sorties, puis annule définitivement',()=>{
  const run=completeStep(startExecution('a',definition,1),'watch',1,[artifact]);
  const paused=controlExecution(run,'pause',2,person);
  expect(paused.status).toBe('paused');expect(paused.outputs).toEqual(run.outputs);
  const resumed=controlExecution(paused,'resume',3,person);expect(resumed.status).toBe('waiting_approval');
  const cancelled=controlExecution(resumed,'cancel',4,person);
  expect(()=>controlExecution(cancelled,'resume',5,person)).toThrow('EXECUTION_TERMINAL');
 });
 it('isole deux dossiers utilisant les mêmes membres',()=>{
  const a=startExecution('a',definition,1),b=startExecution('b',definition,1);
  const next=completeStep(a,'watch',1,[artifact]);
  expect(next.status).toBe('waiting_approval');expect(b.status).toBe('ready');expect(a.outputs).toEqual({});
 });
 it('rejette une réponse de worker périmée',()=>{
  const a=completeStep(startExecution('a',definition,1),'watch',1,[artifact]);
  expect(()=>completeStep(a,'watch',1,[artifact])).toThrow(CircuitError);
 });
 it('une décision rejouée ne valide pas deux fois',()=>{
  const a=completeStep(startExecution('a',definition,1),'watch',1,[artifact]);
  const d={choice:'approve' as const,expectedVersion:2,stepId:'validate',channel:'telegram' as const,idempotencyKey:person,feedback:''};
  const b=decideStep(a,d,actor);expect(b.status).toBe('ready_to_publish');
  expect(decideStep(b,d,actor)).toEqual(b);
  expect(()=>decideStep(b,{...d,choice:'revise'},actor)).toThrow(CircuitError);
 });
 it('refuse un autre approbateur et un bot à la place d’un humain',()=>{
  const a=completeStep(startExecution('a',definition,1),'watch',1,[artifact]);
  const d={choice:'approve' as const,expectedVersion:2,stepId:'validate',channel:'link' as const,idempotencyKey:person,feedback:''};
  expect(()=>decideStep(a,d,{id:'other',kind:'human'})).toThrow(CircuitError);
  expect(()=>decideStep(a,d,{id:person,kind:'bot'})).toThrow(CircuitError);
 });
 it('une correction conserve l’historique et invalide les sorties aval',()=>{
  const a=completeStep(startExecution('a',definition,1),'watch',1,[artifact]);
  const b=decideStep(a,{choice:'revise',expectedVersion:2,stepId:'validate',channel:'link',idempotencyKey:person,feedback:'Sources manquantes'},actor);
  expect(b.currentStepId).toBe('watch');expect(b.outputs).toEqual({});expect(b.history).toHaveLength(2);expect(b.version).toBe(3);
 });
 it('finit une sélection humaine sans artefact inventé',()=>{
  const def=CircuitDefinitionSchema.parse({...definition,steps:[{...definition.steps[0],kind:'selection'},definition.steps[1]]});
  expect(startExecution('a',def,1).status).toBe('waiting_approval');
 });
});
describe('programmation locale',()=>{
 it('conserve 7 h Paris à travers le changement d’heure',()=>{
  expect(nextOccurrences({weekday:1,hour:7,minute:0,timeZone:'Europe/Paris'},'2026-10-19T06:00:00Z',2)).toEqual(['2026-10-26T06:00:00.000Z','2026-11-02T06:00:00.000Z']);
 });
 it('une heure répétée n’engendre qu’une occurrence par date',()=>{
  const times=nextOccurrences({weekday:0,hour:2,minute:30,timeZone:'Europe/Paris'},'2026-10-24T00:00:00Z',2);
  expect(times).toEqual(['2026-10-25T00:30:00.000Z','2026-11-01T01:30:00.000Z']);
 });
});

describe('attente Engine et livrables d’accompagnement (recette Atelier Boréal)', () => {
 const boreal=CircuitDefinitionSchema.parse({name:'Boréal',project:{projectId:person,workspaceId:person,sourceApp:'organigrad',canonicalUrl:'https://example.org/project'},steps:[
  {id:'brief',kind:'visual_brief',assigneeId:person,instructions:'Brief'},{id:'image',kind:'generation',assigneeId:person,instructions:'Image'},
  {id:'validate',kind:'approval',assigneeId:person,instructions:'Valider',correctionStepId:'brief'}]});
 const ref=(kind:'brief'|'visual_prompt'|'image'|'review')=>({...artifact,id:kind,kind});
 it('visual_brief exige le prompt graphique et tolère le brief à côté, jamais à sa place',()=>{
  const run=startExecution('b',boreal,1);
  expect(()=>completeStep(run,'brief',1,[ref('brief')])).toThrow('INVALID_STEP_OUTPUT');
  expect(()=>completeStep(run,'brief',1,[ref('visual_prompt'),ref('review')])).toThrow('INVALID_STEP_OUTPUT');
  const both=completeStep(run,'brief',1,[ref('visual_prompt'),ref('brief')]);
  expect(both.outputs.brief).toEqual([ref('visual_prompt'),ref('brief')]);
  expect(completeStep(run,'brief',1,[ref('visual_prompt')]).outputs.brief).toEqual([ref('visual_prompt')]);
 });
 it('Engine indisponible : état durable, aucune image ; seule une reprise explicite rend l’étape prête',async()=>{
  const {waitForEngine,resumeEngine}=await import('../src/orchestration/circuits.js');
  const run=completeStep(startExecution('b',boreal,1),'brief',1,[ref('visual_prompt'),ref('brief')]);
  expect(()=>waitForEngine(run,'brief',run.version)).toThrow('STALE_EXECUTION');
  const waiting=waitForEngine(run,'image',run.version);
  expect(waiting).toMatchObject({status:'waiting_engine',currentStepId:'image',version:run.version+1});
  expect(waiting.outputs.image).toBeUndefined();
  expect(waiting.history.at(-1)).toMatchObject({kind:'waiting_engine',stepId:'image'});
  expect(()=>waitForEngine(waiting,'image',waiting.version)).toThrow('ENGINE_WAIT_NOT_ALLOWED');
  expect(()=>completeStep(waiting,'image',waiting.version,[ref('image')])).toThrow('STEP_NOT_READY');
  expect(()=>resumeEngine(run,'image',run.version)).toThrow('ENGINE_NOT_WAITING');
  expect(()=>controlExecution(waiting,'retry_engine',waiting.version-1,person)).toThrow('STALE_EXECUTION');
  const resumed=controlExecution(waiting,'retry_engine',waiting.version,person);
  expect(resumed).toMatchObject({status:'ready',currentStepId:'image',version:waiting.version+1});
  expect(resumed.history.at(-1)).toMatchObject({kind:'engine_resumed',actorId:person});
  // La pause reste possible pendant l'attente et la reprise rend l'attente, pas « prêt ».
  const paused=controlExecution(waiting,'pause',waiting.version,person);
  expect(controlExecution(paused,'resume',paused.version,person).status).toBe('waiting_engine');
  // Le dossier n'est jamais terminé sans image réelle.
  expect(()=>decideStep({...resumed,currentStepId:'validate',status:'waiting_approval'},{choice:'approve',expectedVersion:resumed.version,stepId:'validate',channel:'link',idempotencyKey:'33333333-3333-4333-8333-333333333333',feedback:''},actor)).toThrow('DOSSIER_INCOMPLETE');
 });
});
