import packet from '../../docs/bots-import-20260911/profiles.json';
import { validateBotProfile, type BotProfile } from '../types/botProfile';
import type { BotMutationPayload } from '../services/orchestratorService';

type Draft = Omit<BotProfile, 'updated_at' | 'compiledPrompt' | 'compiledSha256'>;
// This reviewed packet is a one-time import source, never the runtime registry.
export const reviewedBots: readonly Draft[] = packet.bots.map(row => {
 const draft = { ...row, enabled: false } as Draft;
 if (validateBotProfile({...draft,compiledPrompt:'',compiledSha256:''}).length) throw new Error('Paquet de fiches invalide.');
 return draft;
});
type ImportClient = {
 fetchBots(): Promise<BotProfile[]>;
 upsertBot(bot: BotMutationPayload): Promise<BotProfile>;
};
export interface ImportProgress { created:number; preserved:number }
export async function importReviewedBots(client:ImportClient,isCurrent:()=>boolean,onProgress:(value:ImportProgress)=>void=()=>{}):Promise<ImportProgress> {
 const current=()=>{if(!isCurrent())throw new Error('Le workspace a changé. Reprenez depuis le workspace voulu.');};
 current();
 const existing=await client.fetchBots();
 current();
 const byId=new Map(existing.map(bot=>[bot.id,bot]));
 const byRuntime=new Map(existing.map(bot=>[bot.runtimeId,bot]));
 const ids=new Set<string>(),runtimes=new Set<string>();
 for(const bot of reviewedBots){
  if(ids.has(bot.id)||runtimes.has(bot.runtimeId)||
   (byId.has(bot.id)&&byId.get(bot.id)!.runtimeId!==bot.runtimeId)||
   (byRuntime.has(bot.runtimeId)&&byRuntime.get(bot.runtimeId)!.id!==bot.id)){
   throw new Error('Conflit d’identité : aucun import effectué. Vérifiez les fiches existantes.');
  }
  ids.add(bot.id);runtimes.add(bot.runtimeId);
 }
 const progress={created:0,preserved:0};
 for(const bot of reviewedBots){
  current();
  if(byId.has(bot.id)){progress.preserved++;}
  else{
   // No updated_at: the client uses POST; a concurrent creation is rejected.
   const result=await client.upsertBot({...bot});
   if(result.id!==bot.id||result.runtimeId!==bot.runtimeId||result.enabled!==false)throw new Error('Création non conforme. Relisez le registre avant de reprendre.');
   progress.created++;
  }
  onProgress({...progress});
 }
 return progress;
}
