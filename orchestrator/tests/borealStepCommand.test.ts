import { expect, it } from 'vitest';
import { CircuitDefinitionSchema } from '@apps2026/contracts';
import { buildBorealStepCommand } from '../src/orchestration/borealStepCommand.js';
import { completeStep, decideStep, startExecution } from '../src/orchestration/circuits.js';

const id='11111111-1111-4111-8111-111111111111';
const human='22222222-2222-4222-8222-222222222222';
const definition=CircuitDefinitionSchema.parse({name:'Boréal',project:{projectId:id,workspaceId:id,sourceApp:'organigrad',canonicalUrl:'https://organigrad.example/projects/boreal'},steps:[
 {id:'watch',kind:'watch',assigneeId:id,instructions:'Veille'},
 {id:'selection',kind:'selection',assigneeId:human,validatorKind:'human',instructions:'Choisir'},
 {id:'writing',kind:'writing',assigneeId:id,instructions:'Article'},
 {id:'brief',kind:'visual_brief',assigneeId:id,instructions:'Brief'},
 {id:'generation',kind:'generation',assigneeId:id,instructions:'Image'},
 {id:'control',kind:'control',assigneeId:id,instructions:'Contrôle'},
 {id:'approval',kind:'approval',assigneeId:human,validatorKind:'human',instructions:'Valider',correctionStepId:'writing'},
]});
const ref=(kind:'watch'|'subject'|'article'|'visual_prompt'|'image'|'review')=>({id:`${kind}-1`,kind,version:1,sourceApp:kind==='image'?'engine':'atelier-orvion',canonicalUrl:`https://example.invalid/${kind}/1`});

it('construit une commande idempotente qui conserve ProjectRef et le sujet retenu',()=>{
 let run=startExecution(id,definition,1);
 const watch=buildBorealStepCommand(run);
 expect(watch).toMatchObject({operation:'watch:create',project:definition.project,runId:id,stepId:'watch',inputs:[]});
 expect(watch.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
 run=completeStep(run,'watch',run.version,[ref('watch'),ref('subject')]);
 run=decideStep(run,{stepId:'selection',choice:'approve',expectedVersion:run.version,selectedArtifact:ref('subject'),channel:'link',feedback:'',idempotencyKey:'33333333-3333-4333-8333-333333333333'},{id:human,kind:'human'});
 const article=buildBorealStepCommand(run);
 expect(article).toMatchObject({operation:'article:create',stepId:'writing',inputs:[ref('subject')]});
 expect(buildBorealStepCommand(run)).toEqual(article);
});

it('refuse une génération sans le prompt visuel versionné',()=>{
 const run={...startExecution(id,definition,1),currentStepId:'generation'};
 expect(()=>buildBorealStepCommand(run)).toThrow('VISUAL_PROMPT_REQUIRED');
});

it('confie le prompt à Engine avant tout rattachement Orvion de l’image',()=>{
 const run={...startExecution(id,definition,1),currentStepId:'generation',outputs:{brief:[ref('visual_prompt')]}};
 expect(buildBorealStepCommand(run)).toMatchObject({operation:'engine:generate',inputs:[ref('visual_prompt')]});
});
