import { readFileSync,writeFileSync } from 'node:fs';
import { compileBotPrompt,sha256Hex,type BotProfile } from '../../orchestrator/src/domain/botProfile';
import { validateBotMutation } from '../../orchestrator/src/state/pgBotStore';
const input=process.argv[2]; const output=process.argv[3];
if (!input || !output) throw new Error('Input and output paths required');
const bots=JSON.parse(readFileSync(input,'utf8')).bots as BotProfile[];
const files: Record<string,{agent:string;content:string;sha256:string}>={};
for (const bot of bots) {
 validateBotMutation(bot);
 const content=compileBotPrompt(bot);
 files[bot.fileName]={agent:bot.runtimeId,content,sha256:sha256Hex(content)};
}
writeFileSync(output,JSON.stringify({files},null,2),'utf8');
console.log(`${bots.length} compiled profiles, offline only`);
