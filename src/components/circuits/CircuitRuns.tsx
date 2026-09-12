import { useEffect,useState } from 'react';
import type { OrchestratorClient } from '../../services/orchestratorService';
import type { CircuitRun } from '../../types/circuit';
import { Button,Surface } from '../../design/ui';
import { CircuitRunCard } from './CircuitRunCard';
export function CircuitRuns({client,userId,admin}:{client:OrchestratorClient|null;userId:string|null;admin:boolean}) {
 const [snapshot,setSnapshot]=useState<{client:OrchestratorClient;runs:CircuitRun[]}|null>(null);
 const [error,setError]=useState(''),[revision,setRevision]=useState(0);
 const current=snapshot?.client===client?snapshot:null;
 useEffect(()=>{
  let active=true;
  if(client)void client.fetchCircuitRuns().then(runs=>{if(active){setSnapshot({client,runs});setError('');}}).catch(()=>{if(active)setError('Les dossiers sont indisponibles.');});
  return()=>{active=false;};
 },[client,revision]);
 function update(run:CircuitRun) {setSnapshot(previous=>previous&&previous.client===client?{...previous,runs:previous.runs.map(item=>item.id===run.id?run:item)}:previous);}
 if(!client)return <Surface className="p-6">Connectez l’orchestrateur pour consulter les dossiers.</Surface>;
 return <section className="space-y-4" aria-label="Dossiers des circuits">
  <div className="flex items-center justify-between gap-4"><h2 className="font-medium">Dossiers en cours et terminés</h2><Button variant="outline" size="sm" onClick={()=>setRevision(value=>value+1)}>Actualiser les dossiers</Button></div>
  {error?<p role="alert">{error}</p>:!current?<p role="status">Chargement des dossiers…</p>:!current.runs.length?<Surface className="p-6">Aucun dossier enregistré pour cet espace.</Surface>:current.runs.map(run=><CircuitRunCard key={JSON.stringify([userId,run.id,run.version])} run={run} userId={userId} admin={admin} onDecision={async decision=>update(await client.decideCircuitRun(run.id,decision))} onControl={async input=>update(await client.controlCircuitRun(run.id,input))}/>)}
 </section>;
}
