import { describe, it, expect } from 'vitest';
import { validateNodeMutation, NodeMutationValidationError } from '../src/api/dto.js';

describe('validateNodeMutation — validation des corps de mutation de nœud', () => {
    const valid = {
        id: 'n1',
        type: 'AGENT_IA',
        nom: 'Agent IA',
        roleTitre: 'Superviseur',
        gradeId: 'E',
    };

    it('accepte un corps minimal valide', () => {
        const result = validateNodeMutation(valid);
        expect(result.id).toBe('n1');
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

    it('lève sur corps non-objet', () => {
        expect(() => validateNodeMutation('chaîne')).toThrow(NodeMutationValidationError);
        expect(() => validateNodeMutation(null)).toThrow(NodeMutationValidationError);
    });
});
