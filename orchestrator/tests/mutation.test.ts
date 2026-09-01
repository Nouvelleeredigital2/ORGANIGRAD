import { describe, it, expect } from 'vitest';
import { toPublicNodeDTO, validateNodeMutation, NodeMutationValidationError } from '../src/api/dto.js';

describe('validateNodeMutation — validation des corps de mutation de nœud', () => {
    const valid = {
        id: '00000000-0000-4000-8000-000000000001',
        type: 'AGENT_IA' as const,
        nom: 'Agent IA',
        roleTitre: 'Superviseur',
        gradeId: 'E',
    };

    it('accepte un corps minimal valide', () => {
        const result = validateNodeMutation(valid);
        expect(result.id).toBe(valid.id);
        expect(result.type).toBe('AGENT_IA');
        // Absent ⇒ conserver (undefined), même règle que les champs sensibles
        // ci-dessous — corrigé le 2026-08-29 (audit P2 : un `skills` toujours
        // `[]` par défaut effaçait les compétences sur tout PUT partiel).
        expect(result.skills).toBeUndefined();
        // Champ sensible absent ⇒ undefined (conserver), pas null (effacer).
        expect(result.systemPrompt).toBeUndefined();
        expect(result.avatarUrl).toBeUndefined();
    });

    it('skills : présent et valide ⇒ tableau filtré ; présent mais invalide ⇒ vidé', () => {
        const withSkills = validateNodeMutation({ ...valid, skills: ['a', 2, 'b', null] });
        expect(withSkills.skills).toEqual(['a', 'b']);
        const malformed = validateNodeMutation({ ...valid, skills: 'pas-un-tableau' });
        expect(malformed.skills).toEqual([]);
    });

    it('avatarUrl : présent et null ⇒ effacement explicite, distinct de absent', () => {
        const cleared = validateNodeMutation({ ...valid, avatarUrl: null });
        expect(cleared.avatarUrl).toBeNull();
        const set = validateNodeMutation({ ...valid, avatarUrl: 'https://x/y.png' });
        expect(set.avatarUrl).toBe('https://x/y.png');
    });

    /**
     * Risque couvert : la SPA ne peut pas lire un champ chiffré. Si « absent »
     * valait « effacer », tout enregistrement depuis l'éditeur de nœud
     * détruirait le prompt système et les canaux de notification.
     */
    it('distingue champ absent (conserver) et null explicite (effacer)', () => {
        const absent = validateNodeMutation(valid);
        expect(absent.systemPrompt).toBeUndefined();
        expect(absent.mcpConfig).toBeUndefined();
        expect(absent.notificationChannels).toBeUndefined();

        const cleared = validateNodeMutation({
            ...valid,
            systemPrompt: null,
            mcpConfig: null,
            notificationChannels: null,
        });
        expect(cleared.systemPrompt).toBeNull();
        expect(cleared.mcpConfig).toBeNull();
        expect(cleared.notificationChannels).toBeNull();
    });

    it('accepte systemPrompt long (< 32 000)', () => {
        const result = validateNodeMutation({ ...valid, systemPrompt: 'x'.repeat(1000) });
        expect(result.systemPrompt).toHaveLength(1000);
    });

    it('refuse systemPrompt trop long (> 32 000)', () => {
        expect(() => validateNodeMutation({ ...valid, systemPrompt: 'x'.repeat(32_001) }))
            .toThrow(NodeMutationValidationError);
    });

    it('refuse id vide', () => {
        expect(() => validateNodeMutation({ ...valid, id: '' }))
            .toThrow(NodeMutationValidationError);
    });

    it('conserve updated_at pour verrouiller une mise à jour', () => {
        const result = validateNodeMutation({ ...valid, updated_at: '2026-09-01T12:00:00.000Z' });
        expect(result.updated_at).toBe('2026-09-01T12:00:00.000Z');
    });

    it('refuse un id qui n’est pas un UUID', () => {
        try {
            validateNodeMutation({ ...valid, id: 'n1' });
            throw new Error('La validation aurait dû échouer');
        } catch (error) {
            expect(error).toBeInstanceOf(NodeMutationValidationError);
            expect((error as NodeMutationValidationError).field).toBe('id');
        }
    });

    it('refuse type inconnu', () => {
        expect(() => validateNodeMutation({ ...valid, type: 'UNKNOWN' }))
            .toThrow(NodeMutationValidationError);
    });

    it('refuse nom absent', () => {
        expect(() => validateNodeMutation({ ...valid, nom: '' }))
            .toThrow(NodeMutationValidationError);
    });

    it('accepte mcpConfig bien formé', () => {
        const result = validateNodeMutation({
            ...valid,
            mcpConfig: { serverUrl: 'https://mcp.ex.com', connectedTo: ['x'] },
        });
        expect(result.mcpConfig?.serverUrl).toBe('https://mcp.ex.com');
    });

    it('ignore mcpConfig malformé (null)', () => {
        const result = validateNodeMutation({ ...valid, mcpConfig: { noServerUrl: true } });
        expect(result.mcpConfig).toBeNull();
    });

    it('accepte notificationChannels avec email seulement', () => {
        const result = validateNodeMutation({
            ...valid,
            notificationChannels: { email: 'test@example.com' },
        });
        expect(result.notificationChannels?.email).toBe('test@example.com');
    });

    it("ignore un ancien canal WhatsApp non supporté", () => {
        const result = validateNodeMutation({
            ...valid,
            notificationChannels: { whatsappId: '+33123456789' },
        });

        expect(result.notificationChannels).toBeNull();
    });

    it('conserve les canaux supportés quand un ancien WhatsApp est présent', () => {
        const result = validateNodeMutation({
            ...valid,
            notificationChannels: { email: 'humain@example.com', whatsappId: '+33123456789' },
        });

        expect(result.notificationChannels).toEqual({ email: 'humain@example.com' });
    });

    it("n'expose pas d'indicateur public WhatsApp", () => {
        const dto = toPublicNodeDTO({
            ...valid,
            parentID: null,
            status: 'IDLE',
            notificationChannels: { slackWebhook: 'https://hooks.slack.com/x' },
        });

        expect(dto.notifications).toEqual({ slack: true, email: false });
        expect(dto.notifications).not.toHaveProperty('whatsapp');
    });

    it('lève sur corps non-objet', () => {
        expect(() => validateNodeMutation('chaîne')).toThrow(NodeMutationValidationError);
        expect(() => validateNodeMutation(null)).toThrow(NodeMutationValidationError);
    });
});
