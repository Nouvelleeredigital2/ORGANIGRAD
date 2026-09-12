import { useRef,useState } from 'react';
import type { CircuitDecision } from '@apps2026/contracts';
import { Button,Pill,Surface } from '../../design/ui';
import { STEP_LABELS,type CircuitRun } from '../../types/circuit';

const labels:Record<CircuitRun['status'],string>={ready:'À exécuter',waiting_approval:'Décision attendue',paused:'En pause',cancelled:'Annulé',ready_to_publish:'Validé — prêt à publier',blocked:'Bloqué'};
const artifactLabels:Record<string,string>={watch:'Veille',subject:'Sujet',brief:'Brief',article:'Article',visual_prompt:'Prompt graphique',image:'Visuel',review:'Contrôle'};
const historyLabels:Record<string,string>={completed:'Livrable enregistré',approved:'Version approuvée',revised:'Correction demandée',paused:'Mise en pause',resumed:'Reprise',cancelled:'Annulation'};
export type CircuitControl={action:'pause'|'resume'|'cancel';expectedVersion:number;idempotencyKey:string};
export function CircuitRunCard({run,userId,admin,onDecision,onControl}:{run:CircuitRun;userId:string|null;admin:boolean;onDecision:(decision:CircuitDecision)=>Promise<unknown>;onControl:(input:CircuitControl)=>Promise<unknown>}) {
 const [subjectIndex,setSubjectIndex]=useState(''),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const receipts=useRef(new Map<string,string>());
 const step=run.definition.steps.find(item=>item.id===run.currentStepId);
 const subjects=Object.values(run.outputs).flat().filter(item=>item.kind==='subject');
 const mayDecide=run.status==='waiting_approval'&&step?.validatorKind==='human'&&step.assigneeId===userId;
 function key(body:unknown) {
  const hash=JSON.stringify(body);let value=receipts.current.get(hash);
  if(!value){value=crypto.randomUUID();receipts.current.set(hash,value);}return value;
 }
 async function submit(choice:'approve'|'revise') {
  if(!step||busy)return;
  if(choice==='revise'&&!feedback.trim()){setError('Précisez la correction attendue.');return;}
  const selected=subjectIndex===''?undefined:subjects[Number(subjectIndex)];
  if(choice==='approve'&&step.kind==='selection'&&!selected){setError('Choisissez le sujet à retenir.');return;}
  const body={choice,expectedVersion:run.version,stepId:step.id,channel:'organigrad' as const,feedback:feedback.trim(),...(choice==='approve'&&step.kind==='selection'?{selectedArtifact:selected}:{})};
  setBusy(true);setError('');
  try{await onDecision({...body,idempotencyKey:key(body)});}
  catch{setError('Décision non confirmée. Vous pouvez réessayer sans créer une seconde décision, ou actualiser le dossier.');}
  finally{setBusy(false);}
 }
 async function control(action:CircuitControl['action']) {
  if(busy)return;const body={action,expectedVersion:run.version};
  setBusy(true);setError('');
  try{await onControl({...body,idempotencyKey:key(body)});}
  catch{setError('Commande non confirmée. Actualisez le dossier ou réessayez.');}
  finally{setBusy(false);}
 }
 return <Surface className="space-y-4 p-5">
  <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">{run.definition.name}</h2><p className="mt-1 text-xs text-[var(--fg-3)]">Version du circuit {run.definitionVersion} · Révision du dossier {run.version}</p></div><Pill>{labels[run.status]}</Pill></header>
  <p className="text-sm">Étape : {step?STEP_LABELS[step.kind]:'Indisponible'}</p>
  <a className="text-sm underline" href={run.definition.project.canonicalUrl} target="_blank" rel="noopener noreferrer">Ouvrir le projet</a>
  <ul className="space-y-2 text-sm">{Object.entries(run.outputs).flatMap(([stepId,refs])=>refs.map(ref=><li key={JSON.stringify([stepId,ref.sourceApp,ref.id,ref.version])}><a className="underline" href={ref.canonicalUrl} target="_blank" rel="noopener noreferrer">{artifactLabels[ref.kind]??'Livrable'} · version {ref.version}</a><span className="ml-2 text-xs text-[var(--fg-3)]">{ref.sourceApp}</span></li>))}</ul>
  {mayDecide&&<div className="space-y-3 rounded-xl border border-[var(--hairline)] p-4">
   {step?.kind==='selection'&&<label className="block text-sm">Sujet à retenir<select className="mt-2 block w-full rounded-lg border border-[var(--hairline)] bg-[var(--bg-1)] p-2" value={subjectIndex} onChange={event=>setSubjectIndex(event.target.value)} disabled={busy}><option value="">Choisir parmi les propositions</option>{subjects.map((subject,index)=><option key={JSON.stringify(subject)} value={index}>Proposition {index+1} · version {subject.version}</option>)}</select></label>}
   {step?.correctionStepId&&<label className="block text-sm">Correction attendue<textarea className="mt-2 block w-full rounded-lg border border-[var(--hairline)] bg-[var(--bg-1)] p-2" value={feedback} maxLength={4000} disabled={busy} onChange={event=>setFeedback(event.target.value)}/></label>}
   <div className="flex flex-wrap gap-2"><Button tone="blue" disabled={busy} onClick={()=>void submit('approve')}>{step?.kind==='selection'?'Retenir ce sujet':'Approuver cette version'}</Button>{step?.correctionStepId&&<Button variant="outline" disabled={busy} onClick={()=>void submit('revise')}>Demander une correction</Button>}</div>
  </div>}
  {run.status==='waiting_approval'&&!mayDecide&&<p className="text-sm text-[var(--fg-3)]">En attente du responsable désigné.</p>}
  {error&&<p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}
  {admin&&!['cancelled','ready_to_publish'].includes(run.status)&&<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void control(run.status==='paused'?'resume':'pause')}>{run.status==='paused'?'Reprendre':'Mettre en pause'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void control('cancel')}>Annuler le dossier</Button></div>}
  {!!run.history.length&&<details className="text-sm"><summary className="cursor-pointer">Historique ({run.history.length})</summary><ol className="mt-3 space-y-2">{run.history.map((event,index)=><li key={index}>{STEP_LABELS[run.definition.steps.find(step=>step.id===event.stepId)?.kind??'control']} · {historyLabels[event.kind]??'Événement'} · révision {event.version}{event.feedback&&<p className="mt-1 text-[var(--fg-3)]">{event.feedback}</p>}</li>)}</ol></details>}
 </Surface>;
}
