import { describe, expect, it } from 'vitest';
import { buildBotBundle } from './botProfileRepo';
import type { BotProfile } from '../types/botProfile';

const bot = (overrides: Partial<BotProfile> = {}): BotProfile => ({
    id: '00000000-0000-4000-8000-000000000001', runtimeId: 'hannah', fileName: 'Hannah.txt', displayName: 'Hannah',
    avatarUrl: null, family: 'veilleur', brand: null, network: null, telegramUsername: null,
    mission: 'Veiller.', personality: '', research: '', watch: '', deliverables: '', method: '', limits: '', usefulContext: '',
    sources: [], model: {}, enabled: true, compiledPrompt: 'Prompt compilé', compiledSha256: 'a'.repeat(64), ...overrides,
});

describe('buildBotBundle', () => {
    it('ne prépare que les profils activés, sans transport', () => {
        const bundle = buildBotBundle([bot(), bot({ id: '00000000-0000-4000-8000-000000000002', enabled: false, fileName: 'Draft.txt' })]);
        expect(bundle.files).toEqual({
            'Hannah.txt': { agent: 'hannah', content: 'Prompt compilé', sha256: 'a'.repeat(64) },
        });
    });
});
