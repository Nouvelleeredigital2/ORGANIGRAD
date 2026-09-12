import { useEffect,useState } from 'react';
import { ArrowRight,Clock,Plus,Workflow } from 'lucide-react';
import { useOrchestratorBridge } from '../../hooks/useOrchestratorBridge';
import { usePermissions } from '../../auth/usePermissions';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { Button,Pill,Surface } from '../../design/ui';
import { CircuitEditor } from '../circuits/CircuitEditor';
import { CircuitRuns } from '../circuits/CircuitRuns';
import { CircuitScheduleAccess } from '../circuits/CircuitScheduleAccess';
import { CircuitOccurrences } from '../circuits/CircuitOccurrences';
import { STEP_LABELS,type CircuitOptions,type StoredCircuit } from '../../types/circuit';
export function CircuitsView() {
 const workspace=useWorkspaceContext();
 return <CircuitWorkspace key={`${workspace.userId}:${workspace.activeId}`} />;
}
function CircuitWorkspace() {
 const {client}=useOrchestratorBridge();const {can}=usePermissions();
 const {userId}=useWorkspaceContext();const [tab,setTab]=useState<'definitions'|'runs'>('definitions');
 const [loaded,setData]=useState<{client:typeof client;circuits:StoredCircuit[];options:CircuitOptions}|null>(null);
 const data=loaded?.client===client?loaded:null;
 const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const [editing,setEditing]=useState<StoredCircuit|null|undefined>(undefined);
 useEffect(()=>{
  let active=true;
  if(client)Promise.all([client.fetchCircuits(),client.fetchCircuitOptions()]).then(([circuits,options])=>{if(active){setData({client,circuits,options});setError('');}}).catch(()=>{if(active)setError('Les circuits sont indisponibles pour cet espace. Vérifiez la connexion et l’activation du module.');});
  return()=>{active=false;};
 },[client,revision]);
 return <main className="mx-auto max-w-5xl space-y-7 p-4 sm:p-8">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--fg-3)]"><Workflow size={16}/>Organisation du travail</div><h1 className="text-3xl font-light tracking-tight">Circuits</h1><p className="mt-2 max-w-xl text-sm text-[var(--fg-3)]">Une équipe, un projet, un parcours. Définissez comment un sujet devient un dossier prêt à publier.</p></div>{editing===undefined&&data&&can('graph:write')&&<Button tone="blue" onClick={()=>setEditing(null)}><Plus size={16}/>Créer un circuit</Button>}</header>
  <nav aria-label="Vues des circuits" className="flex gap-2"><Button variant={tab==='definitions'?'soft':'outline'} onClick={()=>setTab('definitions')}>Définitions</Button><Button variant={tab==='runs'?'soft':'outline'} onClick={()=>setTab('runs')}>Dossiers</Button></nav>
  {tab==='runs'?<CircuitRuns client={client} userId={userId} admin={can('workspace:admin')}/>:!client?<Surface className="p-6">Connectez l’orchestrateur depuis les Paramètres pour retrouver vos circuits.</Surface>:error?<Surface className="p-6"><p role="alert">{error}</p><Button className="mt-4" variant="outline" onClick={()=>setRevision(v=>v+1)}>Réessayer</Button></Surface>:!data?<p role="status">Chargement des circuits et des membres…</p>:editing!==undefined?<CircuitEditor onPreviewSchedule={schedule=>client.previewCircuitSchedule(schedule)} options={data.options} initial={editing?.definition} allowBotApproval={can('workspace:admin')} onCancel={()=>setEditing(undefined)} onSave={async definition=>{await client.saveCircuit(definition,editing??undefined);setEditing(undefined);setRevision(v=>v+1);}}/>:<>
   {!data.circuits.length?<Surface className="p-8"><Workflow className="mb-4 text-[var(--fg-3)]" size={28}/><h2 className="text-lg font-medium">Votre premier circuit</h2><p className="mt-2 text-sm text-[var(--fg-3)]">Choisissez un projet, répartissez les étapes et désignez les personnes qui valident.</p></Surface>:data.circuits.map(circuit=><Surface key={circuit.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-[var(--fg-3)]">{data.options.projects.find(p=>p.ref.projectId===circuit.definition.project.projectId)?.name??'Projet associé'}</p><h2 className="mt-1 text-lg font-medium">{circuit.definition.name}</h2></div><Pill>{circuit.enabled?'Actif':'Brouillon'}</Pill></div><div className="my-5 flex flex-wrap items-center gap-2">{circuit.definition.steps.map((step,i)=><span key={step.id} className="inline-flex items-center gap-2 text-xs"><span className="rounded-lg border border-[var(--hairline)] px-3 py-2">{STEP_LABELS[step.kind]}</span>{i<circuit.definition.steps.length-1&&<ArrowRight size={13} aria-hidden/>}</span>)}</div><footer className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-[var(--fg-3)]"><Clock size={14}/>{circuit.definition.schedule?`${['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][circuit.definition.schedule.weekday]} à ${String(circuit.definition.schedule.hour).padStart(2,'0')}:${String(circuit.definition.schedule.minute).padStart(2,'0')} · ${circuit.definition.schedule.timeZone}`:'Déclenchement manuel'} · Version {circuit.version}</span>{can('graph:write')&&<Button variant="outline" size="sm" onClick={()=>setEditing(circuit)}>Configurer</Button>}</footer>{circuit.definition.schedule&&can('workspace:admin')&&<CircuitScheduleAccess client={client} circuitId={circuit.id} version={circuit.version}/>}{can('workspace:admin')&&<CircuitOccurrences client={client} circuitId={circuit.id}/>}</Surface>)}
  </>}
 </main>;
}
