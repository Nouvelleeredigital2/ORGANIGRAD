import { useEffect,useRef,useState } from 'react';
import type { OrchestratorClient } from '../../services/orchestratorService';
import { randomUuid } from '../../utils/randomId';
import { Button } from '../../design/ui';
type Client=Pick<OrchestratorClient,'startCircuitRun'>;
export function CircuitManualStart({client,circuitId,contextKey,onStarted}:{client:Client;circuitId:string;contextKey:string;onStarted:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const generation=useRef(0),inFlight=useRef(false);
 useEffect(()=>{const current=++generation.current;return()=>{generation.current=current+1;};},[client,circuitId,contextKey]);
 async function start(){
  if(inFlight.current||done)return;
  const current=generation.current;
  const storageKey=`organigrad:circuit-start:${JSON.stringify([contextKey,circuitId])}`;
  let sent=false;
  inFlight.current=true;setBusy(true);setError('');
  try{
   let key=sessionStorage.getItem(storageKey);
   if(key!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))throw new Error('INVALID_REQUEST_KEY');
   if(key===null){key=randomUuid();sessionStorage.setItem(storageKey,key);}
   sent=true;
   await client.startCircuitRun(circuitId,key);
   if(current!==generation.current)return;
   sessionStorage.removeItem(storageKey);
   setDone(true);onStarted();
  }catch{
   if(current===generation.current)setError(sent?'Création non confirmée. Réessayez : la même demande sera reprise sans créer de doublon.':'Le stockage de session est indisponible ou invalide. Vérifiez les réglages de stockage du navigateur avant de reprendre. Aucun dossier n’a été demandé.');
  }finally{inFlight.current=false;if(current===generation.current)setBusy(false);}
 }
 return <section className="mt-4 space-y-2 text-sm" aria-label="Démarrage manuel">
  <p className="text-[var(--fg-3)]">Crée un dossier à la première étape. Les livrables seront produits une fois les services nécessaires raccordés.</p>
  {error&&<p role="alert">{error}</p>}
  {done?<p role="status">Dossier créé.</p>:<Button variant="outline" size="sm" disabled={busy} onClick={()=>void start()}>{busy?'Création…':'Démarrer un dossier'}</Button>}
 </section>;
}
