import { useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Surface } from '../../design/ui';

type Grant = { id:string;api_key_id:string;node_id:string;target:{appId:string;workspaceId:string;resourceId:string};actions:string[];expires_at:string;revoked_at:string|null;version:number };
type Snapshot = {grants:Grant[];keys:Array<{id:string;name:string;scopes:string[]}>;nodes:Array<{id:string;name:string}>};
interface Props { projectId:string;workspaceId:string;ownerId:string;accessToken:string;archived:boolean;blocked:boolean }

/** Secret-free management. The parent keys the panel by account/workspace/project/session. */
export function ProjectServiceDelegations(props:Props) {
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [keyId,setKeyId]=useState(''),[nodeId,setNodeId]=useState(''),[appId,setAppId]=useState(''),[nativeWorkspace,setNativeWorkspace]=useState(''),[resource,setResource]=useState('');
 const [voiceAssign,setVoiceAssign]=useState(false),[voiceResolve,setVoiceResolve]=useState(false);
 const [read,setRead]=useState(false),[execute,setExecute]=useState(false),[expiry,setExpiry]=useState('');
 const storageKey=JSON.stringify(['organigrad-service-delegation',props.ownerId,props.workspaceId,props.projectId]);
 const [saved]=useState<Record<string,unknown>|null>(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)??'null') as Record<string,unknown>|null;}catch{return null;}});
 const [pending,setPending]=useState<Record<string,unknown>|null>(saved?.editing===true?null:saved);
 const uncertain=pending!==null;
 const attemptId=useRef(typeof saved?.grantId==='string'?saved.grantId:crypto.randomUUID());
 const payload=useRef<Record<string,unknown>|null>(pending),generation=useRef(0),controller=useRef<AbortController|null>(null),lock=useRef(false);
 const path=`/api/projects/${encodeURIComponent(props.projectId)}/service-delegations`;
 async function request(url:string,body?:unknown) {
  const abort=new AbortController(); controller.current=abort;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try { return await Promise.race([
   (async()=>{ const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${props.accessToken}`,'X-Workspace-Id':props.workspaceId,'Content-Type':'application/json'},cache:'no-store',redirect:'error',signal:abort.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok)throw new Error(response.status===403?'Accès refusé. Actualisez vos droits.':response.status===409?'Cette autorisation a changé. Relisez son état.':'Service indisponible. Relisez l’état avant de recommencer.');
    return await response.json() as Snapshot;
   })(),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('Délai dépassé. Le résultat reste à vérifier.'));},15000);}),
  ]); }finally{if(timer)clearTimeout(timer);}
 }
 async function load() {
  if(lock.current || props.blocked)return;
  lock.current=true;const revision=++generation.current;setBusy(true);setError('');
  try{const result=await request(path);if(revision===generation.current){setData(result);if(payload.current&&result.grants.some(g=>g.id===payload.current?.grantId)){payload.current=null;setPending(null);sessionStorage.removeItem(storageKey);attemptId.current=crypto.randomUUID();}}}
  catch(e){if(revision===generation.current){setData(null);setError((e as Error).message);}}
  finally{if(revision===generation.current){lock.current=false;setBusy(false);}}
 }
 useEffect(()=>{
  void load();
  const focus=()=>{void load();};window.addEventListener('focus',focus);
  const timer=setInterval(focus,20000);
  const invalidate=()=>{generation.current++;controller.current?.abort();lock.current=false;};
  return()=>{invalidate();window.removeEventListener('focus',focus);clearInterval(timer);};
 // The keyed native project/session boundary owns remounting this panel.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[props.blocked]);
 async function mutate(body:unknown,suffix:string) {
  if(lock.current || props.blocked)return;
  lock.current=true;const revision=++generation.current;setBusy(true);setError('');
  try{
   await request(path+suffix,body);
   if(revision!==generation.current)return;
   const result=await request(path);
   if(revision!==generation.current)return;
   setData(result); if(!suffix){payload.current=null;setPending(null);sessionStorage.removeItem(storageKey);attemptId.current=crypto.randomUUID();}
  }catch(e){if(revision===generation.current){setData(null);setError((e as Error).message);}}
  finally{if(revision===generation.current){lock.current=false;setBusy(false);}}
 }
 const disabled=busy||props.blocked;
 return <Surface className="p-4 space-y-4"><h3 className="font-semibold">Autorisations de service du projet</h3>
  <p className="text-sm text-[var(--fg-3)]">Une clé technique existante peut consulter une exécution ou travailler sur une étape qui lui est attribuée. Chaque contrôle vérifie le projet et sa version. Pour les voix, l’autorisation affecte explicitement un bot actif au projet et exige une clé dotée du scope vocal correspondant. Cela ne programme aucun travail et ne remplace pas une validation humaine.</p>
  {props.blocked&&<p role="alert">Vérification de vos droits en cours. Les actions sont suspendues.</p>}
  {error&&<p role="alert">{error}</p>}
  <Button variant="outline" onClick={()=>void load()} disabled={disabled}>Relire les autorisations</Button>
  {busy&&<p role="status">Vérification en cours…</p>}
  {data&&!props.blocked&&<ul className="space-y-3">{data.grants.map(g=><li key={g.id} className="rounded-lg border border-[var(--border)] p-3 break-words">
   <p>{data.keys.find(k=>k.id===g.api_key_id)?.name ?? 'Clé retirée'} · {g.target.appId}</p>
   <p className="text-sm">{g.target.workspaceId} / {g.target.resourceId}</p>
   <p className="text-sm">{g.actions.map(a=>a==='step:execute'?'Exécuter une étape attribuée':a==='voice:assign'?'Affecter une voix à un bot':a==='voice:resolve'?'Résoudre la voix d’un bot':'Consulter une exécution').join(' · ')}</p>
   <p className="text-sm">{g.revoked_at?'Révoquée':Date.parse(g.expires_at)<=Date.now()?'Expirée':'Configurée — droits revérifiés à chaque utilisation'} · jusqu’au {new Date(g.expires_at).toLocaleString('fr-FR')}</p>
   {!g.revoked_at&&<Button variant="outline" disabled={disabled} onClick={()=>void mutate({grantId:g.id,expectedVersion:g.version},'/revoke')}>Révoquer {g.target.appId}</Button>}
  </li>)}</ul>}
  {!props.archived&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();if(disabled)return;if(!payload.current){const until=new Date(expiry).getTime();if(!Number.isFinite(until)||until<=Date.now()||until>Date.now()+30*86400000){setError('Choisissez une expiration future dans les 30 jours.');return;}payload.current={grantId:attemptId.current,apiKeyId:keyId,nodeId,target:{appId,workspaceId:nativeWorkspace,resourceId:resource},actions:[...(read?['execution:read']:[]),...(execute?['step:execute']:[]),...(voiceAssign?['voice:assign']:[]),...(voiceResolve?['voice:resolve']:[])],expiresAt:new Date(expiry).toISOString()};try{sessionStorage.setItem(storageKey,JSON.stringify(payload.current));}catch{payload.current=null;setError('Le navigateur ne peut pas conserver le reçu. Aucun envoi effectué.');return;}setPending(payload.current);}void mutate(payload.current,'');}}>
   <fieldset disabled={disabled||uncertain||!data} className="grid gap-3 sm:grid-cols-2">
    <label>Clé technique<Select required value={keyId} onChange={e=>setKeyId(e.target.value)}><option value="">Choisir une clé existante</option>{data?.keys.map(k=><option value={k.id} key={k.id}>{k.name}</option>)}</Select></label>
    <label>Responsable dans OrganiGrad<Select required value={nodeId} onChange={e=>setNodeId(e.target.value)}><option value="">Choisir un logiciel ou bot</option>{data?.nodes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</Select></label>
    <label>Identifiant de l’application<Input required pattern="[a-z][a-z0-9-]{1,63}" value={appId} onChange={e=>setAppId(e.target.value)}/></label>
    <label>Espace ou client natif<Input required pattern="[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}" value={nativeWorkspace} onChange={e=>setNativeWorkspace(e.target.value)}/></label>
    <label>Ressource ou capacité native<Input required pattern="[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}" value={resource} onChange={e=>setResource(e.target.value)}/></label>
    <label>Expiration (30 jours maximum)<Input type="datetime-local" required value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
    <label><input type="checkbox" checked={read} onChange={e=>setRead(e.target.checked)}/> Consulter une exécution</label>
    <label><input type="checkbox" checked={execute} onChange={e=>setExecute(e.target.checked)}/> Exécuter une étape attribuée</label>
    <label><input type="checkbox" checked={voiceAssign} onChange={e=>setVoiceAssign(e.target.checked)}/> Affecter une voix à un bot du projet</label>
    <label><input type="checkbox" checked={voiceResolve} onChange={e=>setVoiceResolve(e.target.checked)}/> Résoudre la voix d’un bot du projet</label>
   </fieldset>
   <p className="text-sm text-[var(--fg-3)]">Saisissez les identifiants natifs exacts : leur catalogue n’est pas vérifié automatiquement. Aucun secret n’est demandé ici.</p>
   {uncertain&&<p role="status">Cette demande conserve son identifiant. Réessayez la même demande pour vérifier son résultat, sans créer de doublon.</p>}
   {uncertain&&data&&!data.grants.some(g=>g.id===attemptId.current)&&<Button variant="outline" disabled={disabled} onClick={()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({grantId:attemptId.current,editing:true}));}catch{setError('Le navigateur ne peut pas conserver la correction.');return;}payload.current=null;setPending(null);}}>Corriger la saisie en conservant l’identifiant</Button>}
   <Button type="submit" disabled={disabled||(!uncertain&&!read&&!execute&&!voiceAssign&&!voiceResolve)||(!data&&!uncertain)}>{uncertain?'Vérifier la même demande':'Accorder cette autorisation'}</Button>
  </form>}
 </Surface>;
}
