import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ReviewedBotsImport } from './ReviewedBotsImport';
import type { BotMutationPayload } from '../../services/orchestratorService';
import type { BotProfile } from '../../types/botProfile';

it('previews the historical names without writing, then explicitly imports drafts',async()=>{
 const upsertBot=vi.fn(async(bot:BotMutationPayload)=>({...bot,compiledPrompt:'',compiledSha256:''} as BotProfile));
 const complete=vi.fn();
 render(<ReviewedBotsImport client={{fetchBots:async()=>[],upsertBot}} onComplete={complete}/>);
 fireEvent.click(screen.getByRole('button',{name:'Importer les 14 fiches relues'}));
 expect(screen.getByText('Hannah')).toBeInTheDocument();
 expect(upsertBot).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Créer les fiches absentes en brouillon'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('14 créées'));
 expect(upsertBot).toHaveBeenCalledTimes(14);
 expect(complete).toHaveBeenCalledTimes(1);
});
