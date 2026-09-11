import { describe, expect, it } from 'vitest';
import { compileBot, compileBotPrompt } from './compileBotPrompt';
import { emptyBotProfile } from '../types/botProfile';
import type { BotProfile } from '../types/botProfile';

function profile(overrides: Partial<BotProfile> = {}): BotProfile {
    return {
        ...emptyBotProfile('00000000-0000-4000-8000-000000000001', 'redacteur'),
        runtimeId: 'anita.instagram.bot',
        fileName: 'anita.instagram.bot.txt',
        displayName: 'Anita',
        network: 'instagram',
        brand: 'Nature & Tech',
        mission: 'Adapter un sujet validé à Instagram sans déformer le fond.',
        ...overrides,
    };
}

describe('compileBotPrompt (aperçu client)', () => {
    it('est déterministe', () => {
        expect(compileBotPrompt(profile())).toBe(compileBotPrompt(profile()));
    });

    it('inclut le nom, la marque et la mission', () => {
        const prompt = compileBotPrompt(profile());
        expect(prompt).toContain('Anita');
        expect(prompt).toContain('Nature & Tech');
        expect(prompt).toContain('Adapter un sujet validé à Instagram');
    });

    it("n'ajoute pas la section sources quand la liste est vide", () => {
        expect(compileBotPrompt(profile({ sources: [] }))).not.toContain('Sources de reference');
    });

    it('liste les sources fournies', () => {
        const prompt = compileBotPrompt(
            profile({ sources: [{ label: 'Meta', url: 'https://www.facebook.com/business/help' }] }),
        );
        expect(prompt).toContain('https://www.facebook.com/business/help');
    });
});

describe('compileBot', () => {
    it("produit une empreinte qui suit le texte compilé", () => {
        const a = compileBot(profile());
        const b = compileBot(profile({ mission: 'Autre mission.' }));
        expect(a.sha256).toHaveLength(64);
        expect(a.sha256).not.toBe(b.sha256);
    });
});
