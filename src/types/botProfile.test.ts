import { describe, expect, it } from 'vitest';
import { emptyBotProfile, validateBotProfile } from './botProfile';

describe('validateBotProfile', () => {
    it('creates a draft requiring activation verification', () => {
        expect(emptyBotProfile('00000000-0000-4000-8000-000000000001').enabled).toBe(false);
    });
    const valid = () => ({
        ...emptyBotProfile('00000000-0000-4000-8000-000000000001', 'redacteur'),
        runtimeId: 'anita.instagram.bot',
        fileName: 'anita.instagram.bot.txt',
        displayName: 'Anita',
        network: 'instagram',
        mission: 'Adapter un sujet validé à Instagram.',
    });

    it('accepte une fiche minimale valide', () => {
        expect(validateBotProfile(valid())).toEqual([]);
    });

    it('accepts an optional HTTPS portrait and rejects executable, insecure or credentialed URLs', () => {
        expect(validateBotProfile({ ...valid(), avatarUrl: 'https://images.example.org/hannah.png' })).toEqual([]);
        for (const avatarUrl of ['javascript:alert(1)', 'data:image/png;base64,AA', 'http://example.org/a.png', 'https://user:secret@example.org/a.png', 'https://', 'https://example.org/' + 'x'.repeat(2048)]) {
            expect(validateBotProfile({ ...valid(), avatarUrl })).not.toHaveLength(0);
        }
    });

    it('exige un nom affiché', () => {
        expect(validateBotProfile({ ...valid(), displayName: '' })).not.toHaveLength(0);
    });

    it('exige une mission', () => {
        expect(validateBotProfile({ ...valid(), mission: '   ' })).not.toHaveLength(0);
    });

    it('refuse un identifiant runtime avec majuscule', () => {
        expect(validateBotProfile({ ...valid(), runtimeId: 'Anita' })).not.toHaveLength(0);
    });

    it('refuse un fichier sans extension .txt', () => {
        expect(validateBotProfile({ ...valid(), fileName: 'anita' })).not.toHaveLength(0);
    });

    it('exige un réseau pour un rédacteur', () => {
        expect(validateBotProfile({ ...valid(), network: null })).not.toHaveLength(0);
    });

    it("n'exige pas de réseau pour un veilleur", () => {
        expect(
            validateBotProfile({
                ...valid(),
                family: 'veilleur',
                network: null,
                runtimeId: 'hannah',
                fileName: 'Hannah.txt',
            }),
        ).toEqual([]);
    });

    it('rejette une source sans URL http(s)', () => {
        expect(
            validateBotProfile({ ...valid(), sources: [{ label: 'PubMed', url: 'pas-une-url' }] }),
        ).not.toHaveLength(0);
    });

    it('accepte une source valide', () => {
        expect(
            validateBotProfile({
                ...valid(),
                sources: [{ label: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/' }],
            }),
        ).toEqual([]);
    });

    it('rejette une température hors bornes', () => {
        expect(validateBotProfile({ ...valid(), model: { temperature: 3 } })).not.toHaveLength(0);
        expect(validateBotProfile({ ...valid(), model: { temperature: -1 } })).not.toHaveLength(0);
        expect(validateBotProfile({ ...valid(), model: { temperature: 0.5 } })).toEqual([]);
    });
});
