import type { FastifyInstance } from 'fastify';

/** Serial polling; SQL locks and occurrence uniqueness fence other processes.
 * Closing the HTTP server drains the current transaction before returning. */
export function registerCircuitWorker(app:FastifyInstance,scheduler:{tick(now:string):Promise<unknown>},intervalMs=15000) {
 let stopped=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let running:Promise<void>|undefined;
 const poll=()=>{
  if(stopped)return;
  running=Promise.resolve().then(()=>scheduler.tick(new Date().toISOString()))
   .then(()=>undefined)
   .catch(()=>{app.log.error('Circuit scheduler tick failed');})
   .finally(()=>{
    if(!stopped){timer=setTimeout(poll,intervalMs);timer.unref();}
   });
 };
 app.addHook('onReady',async()=>{poll();});
 app.addHook('onClose',async()=>{
  stopped=true;
  if(timer)clearTimeout(timer);
  await running;
 });
}
