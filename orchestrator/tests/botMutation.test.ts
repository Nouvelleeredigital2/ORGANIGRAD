import { describe, it, expect } from 'vitest';
import { validateBotMutation, BotValidationError } from '../src/state/pgBotStore.js';
import { compileBotPrompt, sha256Hex, type BotProfile } from '../src/domain/botProfile.js';

const VALID = {
    id: '00000000-0000-4000-8000-000000000001',
    runtimeId: 'anita.instagram.bot',
    fileName: 'anita.instagram.bot.txt',
    displayName: 'Anita',
    family: 'redacteur',
    network: 'instagram',
    mission: 'Adapter un sujet valide a Instagram.',
};

describe('validateBotMutation — validation du corps de mutation de bot', () => {
    it('validates HTTPS portraits without fetching the URL', () => {
        expect(validateBotMutation({ ...VALID, avatarUrl: 'https://images.example.org/a.png' })).toMatchObject({ avatarUrl: 'https://images.example.org/a.png' });
        for (const avatarUrl of ['javascript:alert(1)', 'data:image/png;base64,AA', 'http://example.org/a.png', 'https://user:secret@example.org/a.png', 'https://', 42]) {
            expect(() => validateBotMutation({ ...VALID, avatarUrl })).toThrow(BotValidationError);
        }
    });
    it('accepte un corps minimal valide et pose les défauts', () => {
        const result = validateBotMutation(VALID);
        expect(result.id).toBe(VALID.id);
        expect(result.runtimeId).toBe('anita.instagram.bot');
        expect(result.enabled).toBeUndefined();
        expect(result.sources).toEqual([]);
        expect(result.brand).toBeNull();
    });

    it('refuse un id non-UUID', () => {
        expect(() => validateBotMutation({ ...VALID, id: 'pas-un-uuid' })).toThrow(BotValidationError);
    });

    it('refuse un runtimeId avec majuscule ou espace', () => {
        expect(() => validateBotMutation({ ...VALID, runtimeId: 'Anita Bot' })).toThrow(BotValidationError);
    });

    it('refuse un fileName sans extension .txt', () => {
        expect(() => validateBotMutation({ ...VALID, fileName: 'anita' })).toThrow(BotValidationError);
    });

    it('exige un réseau pour un rédacteur', () => {
        expect(() => validateBotMutation({ ...VALID, network: undefined })).toThrow(BotValidationError);
    });

    it("n'exige pas de réseau pour un veilleur", () => {
        const result = validateBotMutation({
            ...VALID,
            family: 'veilleur',
            network: undefined,
            runtimeId: 'hannah',
            fileName: 'Hannah.txt',
        });
        expect(result.network).toBeNull();
    });

    it('rejette une source sans URL', () => {
        expect(() =>
            validateBotMutation({ ...VALID, sources: [{ label: 'PubMed' }] }),
        ).toThrow(BotValidationError);
    });

    it('accepte des sources valides et un modèle partiel', () => {
        const result = validateBotMutation({
            ...VALID,
            sources: [{ label: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/', note: 'référence' }],
            model: { temperature: 0.2 },
        });
        expect(result.sources).toEqual([{ label: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/', note: 'référence' }]);
        expect(result.model).toEqual({ temperature: 0.2 });
    });

    it('rejette un champ texte trop long (miroir de la contrainte SQL)', () => {
        expect(() => validateBotMutation({ ...VALID, mission: 'x'.repeat(2001) })).toThrow(BotValidationError);
    });
});

function fullProfile(overrides: Partial<BotProfile> = {}): BotProfile {
    return {
        id: VALID.id,
        runtimeId: 'anita.instagram.bot',
        fileName: 'anita.instagram.bot.txt',
        displayName: 'Anita',
        family: 'redacteur',
        network: 'instagram',
        brand: 'Nature & Tech',
        telegramUsername: null,
        mission: 'Adapter un sujet validé à Instagram sans déformer le fond.',
        personality: 'Visuelle, vive et accessible.',
        research: '',
        watch: '',
        deliverables: 'Trois variantes numérotées.',
        method: '',
        limits: 'Pas de garantie de viralité.',
        usefulContext: '',
        sources: [{ label: 'Meta for Business', url: 'https://www.facebook.com/business/help' }],
        model: { provider: 'ollama-cloud', model: 'gpt-oss:120b', temperature: 0.3 },
        enabled: true,
        compiledPrompt: '',
        compiledSha256: '',
        ...overrides,
    };
}

describe('compileBotPrompt — compilation déterministe', () => {
    it('uses configured actors rather than a hardcoded approver or mandatory channel', () => {
        const prompt = compileBotPrompt(fullProfile());
        expect(prompt).not.toContain('Laurent choisit');
        expect(prompt).not.toContain('jamais dans cette conversation');
        expect(prompt).toContain('LINK, Telegram ou OrganiGrad');
        expect(prompt).toContain('validation finale est humaine par defaut');
        expect(prompt).toContain('confirmation reelle');
        expect(prompt).toContain('pret a publier');
    });
    it('est pure : mêmes champs, même texte, même empreinte', () => {
        const a = compileBotPrompt(fullProfile());
        const b = compileBotPrompt(fullProfile());
        expect(a).toBe(b);
        expect(sha256Hex(a)).toBe(sha256Hex(b));
    });

    it('change dès qu’un champ métier change', () => {
        const a = compileBotPrompt(fullProfile());
        const b = compileBotPrompt(fullProfile({ mission: 'Une autre mission.' }));
        expect(a).not.toBe(b);
    });

    it('inclut le nom, la marque et la mission', () => {
        const prompt = compileBotPrompt(fullProfile());
        expect(prompt).toContain('Anita');
        expect(prompt).toContain('Nature & Tech');
        expect(prompt).toContain('Adapter un sujet validé à Instagram');
    });

    it('liste les sources avec leur URL, sans prétendre à une consultation', () => {
        const prompt = compileBotPrompt(fullProfile());
        expect(prompt).toContain('https://www.facebook.com/business/help');
        expect(prompt).toContain('pas une preuve de consultation du jour');
    });

    it("n'ajoute pas la section sources quand la liste est vide", () => {
        const prompt = compileBotPrompt(fullProfile({ sources: [] }));
        expect(prompt).not.toContain('Sources de reference');
    });

    it('porte le contrat commun anti-fabrication identique pour tous les bots', () => {
        const a = compileBotPrompt(fullProfile());
        const b = compileBotPrompt(fullProfile({ family: 'veilleur', network: null, displayName: 'Hannah' }));
        expect(a).toContain("n'invente aucun chiffre");
        expect(b).toContain("n'invente aucun chiffre");
    });
});
