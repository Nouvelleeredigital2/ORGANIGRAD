import { expect, it, vi } from 'vitest';
import { importReviewedBots, reviewedBots } from './importReviewedBots';
import type { BotProfile } from '../types/botProfile';

const saved = (i: number): BotProfile => ({ ...reviewedBots[i]!, compiledPrompt: 'compiled', compiledSha256: 'a'.repeat(64) });
it('creates the fourteen historical identities as drafts, without an update version', async () => {
 const upsertBot=vi.fn(async (bot)=>({...bot,compiledPrompt:'compiled',compiledSha256:'a'.repeat(64)}));
 const result=await importReviewedBots({fetchBots:async()=>[],upsertBot},()=>true);
 expect(result).toEqual({created:14,preserved:0});
 expect(new Set(upsertBot.mock.calls.map(([bot])=>bot.id)).size).toBe(14);
 expect(upsertBot.mock.calls.every(([bot])=>bot.enabled===false && !('updated_at' in bot))).toBe(true);
 expect(upsertBot.mock.calls[0]![0].id).toBe('e91c51da-aa09-507e-8dea-b23dc23e8a75');
});
it('preserves existing edited/active profiles on retry', async()=>{
 const existing={...saved(0),mission:'Modification humaine',enabled:true};
 const upsertBot=vi.fn(async (bot)=>({...bot,compiledPrompt:'compiled',compiledSha256:'a'.repeat(64)}));
 expect(await importReviewedBots({fetchBots:async()=>[existing],upsertBot},()=>true)).toEqual({created:13,preserved:1});
 expect(upsertBot.mock.calls.some(([bot])=>bot.id===existing.id)).toBe(false);
});
it('checks all identity collisions before writing even when the last profile conflicts',async()=>{
 const upsertBot=vi.fn();
 await expect(importReviewedBots({fetchBots:async()=>[{...saved(13),runtimeId:'another'}],upsertBot},()=>true)).rejects.toThrow('identité');
 expect(upsertBot).not.toHaveBeenCalled();
});
it('stops after a failed write and can resume without overwriting completed profiles',async()=>{
 const existing:BotProfile[]=[];
 const upsertBot=vi.fn(async(bot)=>{if(existing.length===2)throw new Error('unavailable');const row={...bot,compiledPrompt:'compiled',compiledSha256:'a'.repeat(64)};existing.push(row);return row;});
 await expect(importReviewedBots({fetchBots:async()=>existing,upsertBot},()=>true)).rejects.toThrow();
 expect(upsertBot).toHaveBeenCalledTimes(3);
 const retry=vi.fn(async(bot)=>({...bot,compiledPrompt:'compiled',compiledSha256:'a'.repeat(64)}));
 expect(await importReviewedBots({fetchBots:async()=>existing,upsertBot:retry},()=>true)).toEqual({created:12,preserved:2});
});
it('stops subsequent writes after a workspace change',async()=>{
 let current=true;
 const upsertBot=vi.fn(async(bot)=>{current=false;return {...bot,compiledPrompt:'compiled',compiledSha256:'a'.repeat(64)};});
 await expect(importReviewedBots({fetchBots:async()=>[],upsertBot},()=>current)).rejects.toThrow('workspace');
 expect(upsertBot).toHaveBeenCalledTimes(1);
});
