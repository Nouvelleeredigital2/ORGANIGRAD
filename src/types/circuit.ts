import type { ArtifactReference, CircuitDefinition, CircuitStep, ProjectRef } from '@apps2026/contracts';
export const STEP_LABELS:Record<CircuitStep['kind'],string>={watch:'Veille sourcée',selection:'Choix du sujet',writing:'Rédaction',visual_brief:'Brief visuel',generation:'Génération du visuel',control:'Contrôle',approval:'Validation finale'};
export interface CircuitOptions {
 projects:Array<{name:string;ref:ProjectRef}>;
 humans:Array<{id:string;name:string}>;
 workers:Array<{id:string;name:string}>;
}
export interface StoredCircuit { id:string; version:number; definition:CircuitDefinition; enabled:boolean; }
export interface CircuitRun {
 id:string; definition:CircuitDefinition; definitionVersion:number; version:number;
 status:'ready'|'waiting_approval'|'paused'|'cancelled'|'ready_to_publish'|'blocked';
 currentStepId:string; outputs:Record<string,ArtifactReference[]>;
 history:Array<{stepId:string;version:number;kind:string;feedback?:string;actorId?:string}>;
}
