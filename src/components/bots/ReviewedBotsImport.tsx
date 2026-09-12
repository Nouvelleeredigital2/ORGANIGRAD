import { useEffect, useRef, useState } from 'react';
import { importReviewedBots, reviewedBots, type ImportProgress } from '../../bots/importReviewedBots';
import { BOT_FAMILY_LABEL } from '../../types/botProfile';
import { Button, Surface } from '../../design/ui';
import { messageErreurUtilisateur } from '../../utils/asyncGuard';

type Props={client:Parameters<typeof importReviewedBots>[0];onComplete:()=>void|Promise<void>};
export function ReviewedBotsImport({client,onComplete}:Props){
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState<ImportProgress|null>(null);
 const [error,setError]=useState<string|null>(null);
 const active=useRef<Props['client']|null>(client);
 const running=useRef(false);
 useEffect(()=>{active.current=client;return()=>{active.current=null;};},[client]);
 const start=async()=>{
  if(running.current)return;
  running.current=true;setBusy(true);setError(null);setProgress({created:0,preserved:0});
  const current=()=>active.current===client;
  try{
   await importReviewedBots(client,current,value=>{if(current())setProgress(value);});
  }catch(reason){if(current())setError(`Import interrompu : ${messageErreurUtilisateur(reason)} Les fiches déjà créées sont conservées ; vous pouvez reprendre.`);}
  finally{
   running.current=false;
   if(current()){
    setBusy(false);
    try{await onComplete();}catch{if(current())setError('Relecture du registre indisponible. Actualisez la page avant de reprendre.');}
   }
  }
 };
 return <div>
  <Button tone="slate" variant="soft" onClick={()=>setOpen(!open)} disabled={busy}>Importer les 14 fiches relues</Button>
  {open&&<Surface className="mt-4 p-5" aria-label="Import des fiches historiques">
   <h2 className="text-lg font-semibold">Fiches relues — septembre 2026</h2>
   <p className="mt-2 text-sm">Création en brouillon dans le workspace courant. Les identifiants historiques sont conservés et les fiches existantes restent intactes. L’import n’active aucun bot ni aucune programmation.</p>
   <ul className="my-4 grid gap-2 sm:grid-cols-2">{reviewedBots.map(bot=><li key={bot.id}><strong>{bot.displayName}</strong> · {BOT_FAMILY_LABEL[bot.family]}{bot.brand?` · ${bot.brand}`:''}</li>)}</ul>
   {progress&&<p role="status" className="my-3">{progress.created} créées · {progress.preserved} déjà présentes{busy?' · Import en cours…':''}</p>}
   {error&&<p role="alert" className="my-3">{error}</p>}
   <Button tone="blue" onClick={()=>void start()} disabled={busy}>Créer les fiches absentes en brouillon</Button>
  </Surface>}
 </div>;
}
