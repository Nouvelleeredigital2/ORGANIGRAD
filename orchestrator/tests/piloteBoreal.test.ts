import { expect, it } from 'vitest';
import { CircuitDefinitionSchema, type ArtifactReference } from '@apps2026/contracts';
import fixture from './fixtures/pilote-boreal.json';
import { startExecution, completeStep, decideStep } from '../src/orchestration/circuits.js';

it('le projet fictif parcourt sélection, production, correction et validation sans mélanger deux dossiers',()=>{
 const human=fixture.members[4]!.id;
 const definition=CircuitDefinitionSchema.parse({name:fixture.project.name,project:fixture.project.ref,
  schedule:((({enabled,...schedule})=>schedule)(fixture.schedule)),
  steps:[
   {id:'watch',kind:'watch',assigneeId:fixture.members[0]!.id,instructions:'Veille fictive'},
   {id:'select',kind:'selection',assigneeId:human,instructions:'Choisir',correctionStepId:'watch'},
   {id:'write',kind:'writing',assigneeId:fixture.members[1]!.id,instructions:'Rédiger'},
   {id:'brief',kind:'visual_brief',assigneeId:fixture.members[2]!.id,instructions:'Brief'},
   {id:'image',kind:'generation',assigneeId:fixture.members[3]!.id,instructions:'Résultat simulé'},
   {id:'approve',kind:'approval',assigneeId:human,instructions:'Valider',correctionStepId:'write'}]});
 const first=fixture.dossiers[0]!;
 let run=startExecution(first.id,definition,1);
 const other=startExecution(fixture.dossiers[1]!.id,definition,1);
 const artifact=(kind:ArtifactReference['kind'],version=1):ArtifactReference=>({id:`${first.id}-${kind}`,kind,version,sourceApp:'atelier-orvion',canonicalUrl:`https://orvion.example.invalid/dossiers/${first.id}/${kind}/${version}`});
 run=completeStep(run,'watch',run.version,[artifact('watch'),artifact('subject')]);
 run=decideStep(run,{stepId:'select',expectedVersion:run.version,choice:'approve',feedback:'',channel:'telegram',selectedArtifact:artifact('subject'),idempotencyKey:'10000000-0000-4000-8000-000000000031'},{id:human,kind:'human'});
 const produce=(version:number)=>{
  run=completeStep(run,'write',run.version,[artifact('article',version)]);
  run=completeStep(run,'brief',run.version,[artifact('visual_prompt',version)]);
  run=completeStep(run,'image',run.version,[artifact('image',version)]);
 };
 produce(1);
 run=decideStep(run,{stepId:'approve',expectedVersion:run.version,choice:'revise',channel:'link',feedback:first.correction,idempotencyKey:'10000000-0000-4000-8000-000000000032'},{id:human,kind:'human'});
 expect(run.outputs.write).toBeUndefined();
 expect(run.outputs.image).toBeUndefined();
 expect(run.outputs.watch).toHaveLength(2);
 produce(2);
 const decision={stepId:'approve',expectedVersion:run.version,choice:'approve' as const,feedback:'',channel:'link' as const,idempotencyKey:'10000000-0000-4000-8000-000000000033'};
 run=decideStep(run,decision,{id:human,kind:'human'});
 expect(run.status).toBe('ready_to_publish');
 expect(decideStep(run,decision,{id:human,kind:'human'})).toEqual(run);
 expect(run.outputs.write?.[0]?.version).toBe(2);
 expect(run.history.filter(entry=>entry.stepId==='write'&&entry.kind==='completed')).toHaveLength(2);
 expect(other.outputs).toEqual({});
 expect(other.status).toBe('ready');
});

it('les sources et identités sont fictives ; aucune publication ni image réelle annoncée',()=>{
 expect(fixture.synthetic).toBe(true);
 expect(fixture.remoteImport).toBe('not-performed');
 expect(fixture.sources.every(source=>new URL(source.url).hostname.endsWith('.invalid'))).toBe(true);
 expect(fixture.schedule.enabled).toBe(false);
 expect(fixture.publication.enabled).toBe(false);
 expect(fixture.engine.realJobId).toBeNull();
 expect(fixture.engine.realImageUrl).toBeNull();
 expect(new Set(fixture.members.map(member=>member.id)).size).toBe(fixture.members.length);
});
