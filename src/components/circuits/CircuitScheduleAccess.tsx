import { useEffect,useRef,useState } from 'react';
import type { OrchestratorClient } from '../../services/orchestratorService';
import type { ScheduleAuthorization } from '../../types/circuit';
import { Button } from '../../design/ui';
type Client=Pick<OrchestratorClient,'fetchCircuitSchedule'|'authorizeCircuitSchedule'|'revokeCircuitSchedule'>;
type Request={idempotencyKey:string;expectedVersion:number;expiresAt:string};
export function CircuitScheduleAccess({client,circuitId,version}:{client:Client;circuitId:string;version:number}) {
 const [loaded,setLoaded]=useState<{client:Client;circuitId:string;version:number;authorization:ScheduleAuthorization|null}|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const [pending,setPending]=useState<{client:Client;circuitId:string;input:Request}|null>(null);
 const generation=useRef(0);
 const data=loaded?.client===client&&loaded.circuitId===circuitId&&loaded.version===version?loaded:null;
 useEffect(()=>{
  const current=++generation.current;
  client.fetchCircuitSchedule(circuitId).then(authorization=>{
   if(current===generation.current){setLoaded({client,circuitId,version,authorization});setError('');setBusy(false);}
  }).catch(()=>{if(current===generation.current){setError('Impossible de lire l’autorisation.');setBusy(false);}});
  return()=>{generation.current=current+1;};
 },[client,circuitId,version,refresh]);
 async function authorize() {
  const current=generation.current;setBusy(true);setError('');
  const input=pending?.client===client&&pending.circuitId===circuitId&&pending.input.expectedVersion===version?pending.input:{idempotencyKey:crypto.randomUUID(),expectedVersion:version,expiresAt:new Date(Date.now()+14*86400000).toISOString()};
  setPending({client,circuitId,input});
  try {
   const authorization=await client.authorizeCircuitSchedule(circuitId,input);
   if(current===generation.current){setLoaded({client,circuitId,version,authorization});setPending(null);}
  }catch{if(current===generation.current)setError('Autorisation non confirmée. Réessayez pour vérifier la même demande.');}
  finally{if(current===generation.current)setBusy(false);}
 }
 async function revoke() {
  if(!data?.authorization)return;
  const current=generation.current;setBusy(true);setError('');
  try {
   await client.revokeCircuitSchedule(circuitId,data.authorization.grantId);
   if(current===generation.current){setLoaded({client,circuitId,version,authorization:null});setPending(null);}
  }catch{if(current===generation.current)setError('Révocation non confirmée. Réessayez avant de considérer le droit retiré.');}
  finally{if(current===generation.current)setBusy(false);}
 }
 if(!data)return <div className="mt-4 text-sm">{error?<><p role="alert">{error}</p><Button variant="outline" onClick={()=>setRefresh(v=>v+1)}>Réessayer</Button></>:<p role="status">Lecture de l’autorisation…</p>}</div>;
 const authorization=data.authorization;
 return <section aria-label="Autorisation de programmation" className="mt-5 space-y-3 border-t border-[var(--hairline)] pt-4 text-sm">
  <p className="font-medium">{authorization?'Autorisation configurée':'Aucune autorisation configurée'}</p>
  {authorization&&<p className="text-[var(--fg-3)]">Échéance : {new Date(authorization.expiresAt).toLocaleString('fr-FR')} · Prochaine occurrence prévue : {new Date(authorization.nextDueAt).toLocaleString('fr-FR')}</p>}
  <p className="text-[var(--fg-3)]">Ce droit permet la programmation ; il ne démarre pas le worker. Le circuit et son exécuteur doivent aussi être activés.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={()=>void authorize()}>{pending?'Réessayer l’autorisation':authorization?'Renouveler pour 14 jours':'Autoriser pour 14 jours'}</Button>
   {authorization&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void revoke()}>Révoquer l’autorisation</Button>}</div>
 </section>;
}
