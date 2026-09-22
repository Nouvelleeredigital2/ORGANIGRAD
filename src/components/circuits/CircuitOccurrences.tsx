import { useEffect,useRef,useState } from 'react';
import type { OrchestratorClient } from '../../services/orchestratorService';
import type { ScheduleOccurrence } from '../../types/circuit';
import { Button } from '../../design/ui';
type Client=Pick<OrchestratorClient,'fetchCircuitOccurrences'|'recoverCircuitOccurrence'>;
export function CircuitOccurrences({client,circuitId}:{client:Client;circuitId:string}) {
 const [loaded,setLoaded]=useState<{client:Client;circuitId:string;rows:ScheduleOccurrence[]}|null>(null);
 const [refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0);
 const data=loaded?.client===client&&loaded.circuitId===circuitId?loaded:null;
 useEffect(()=>{
  const current=++generation.current;
  client.fetchCircuitOccurrences(circuitId).then(rows=>{
   if(current===generation.current){setLoaded({client,circuitId,rows});setError('');setBusy(false);}
  }).catch(()=>{if(current===generation.current){setError('Impossible de lire les occurrences.');setBusy(false);}});
  return()=>{generation.current=current+1;};
 },[client,circuitId,refresh]);
 async function recover(occurrenceId:string) {
  const current=generation.current;setBusy(true);setError('');
  try {
   const run=await client.recoverCircuitOccurrence(circuitId,occurrenceId);
   if(current===generation.current)setLoaded(previous=>previous?{...previous,rows:previous.rows.map(row=>row.id===occurrenceId?{...row,recoveredRunId:run.id}:row)}:previous);
  }catch{if(current===generation.current)setError('Rattrapage non confirmé. Réessayez : la même occurrence ne créera pas un second dossier.');}
  finally{if(current===generation.current)setBusy(false);}
 }
 return <section aria-label="Historique de programmation" className="mt-4 space-y-3 border-t border-[var(--hairline)] pt-4 text-sm">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Occurrences récentes</h3><Button variant="outline" size="sm" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Actualiser les occurrences</Button></div>
  {error&&<p role="alert">{error}</p>}
  {!data&&!error&&<p role="status">Lecture des occurrences…</p>}
  {data&&!data.rows.length&&<p>Aucune occurrence enregistrée.</p>}
  {data?.rows.some(row=>row.status==='missed'&&!row.recoveredRunId)&&<p className="text-[var(--fg-3)]">Le rattrapage crée un dossier avec la version du circuit prévue à cette date. Il reste en attente de son exécuteur.</p>}
  <ul className="space-y-3">{data?.rows.map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
   <div><time dateTime={row.scheduledFor}>{new Date(row.scheduledFor).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})}</time> · Europe/Paris · Version {row.definitionVersion}<p>{row.recoveredRunId?'Manquée — dossier de rattrapage créé':row.status==='missed'?'Manquée':'Dossier créé'}</p></div>
   {row.status==='missed'&&!row.recoveredRunId&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void recover(row.id)}>Rattraper cette occurrence</Button>}
  </li>)}</ul>
 </section>;
}
