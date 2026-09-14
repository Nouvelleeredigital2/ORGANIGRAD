import { useEffect,useRef,useState } from 'react';
import { CircuitScheduleSchema,type CircuitSchedule } from '@apps2026/contracts';
import { Button } from '../../design/ui';

/** CircuitEditor keys this component by schedule: edits clear the previous dates
 * immediately and cleanup prevents a late response from repopulating them. */
export function CircuitSchedulePreview({schedule,preview}:{schedule:CircuitSchedule;preview:(schedule:CircuitSchedule)=>Promise<string[]>}) {
 const active=useRef(true);
 const [dates,setDates]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function load() {
  setDates([]);setError('');
  const parsed=CircuitScheduleSchema.safeParse(schedule);
  if(!parsed.success){setError('Vérifiez le jour, l’heure et le fuseau horaire.');return;}
  setBusy(true);
  try {
   const result=await preview(parsed.data);
   if(active.current)setDates(result);
  }catch{if(active.current)setError('Aperçu indisponible. Vérifiez la connexion puis réessayez.');}
  finally{if(active.current)setBusy(false);}
 }
 return <section aria-label="Prochaines occurrences" className="mt-4 space-y-3">
  <Button variant="outline" type="button" disabled={busy} onClick={load}>Voir les prochaines dates</Button>
  {busy&&<p role="status" className="text-sm">Calcul des prochaines dates…</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {dates.length>0&&<div aria-live="polite" className="text-sm"><p>Dates prévues · {schedule.timeZone}</p><ol className="mt-2 space-y-1">{dates.map(date=><li key={date}><time dateTime={date}>{new Intl.DateTimeFormat('fr-FR',{timeZone:schedule.timeZone,dateStyle:'full',timeStyle:'short'}).format(new Date(date))}</time></li>)}</ol></div>}
 </section>;
}
