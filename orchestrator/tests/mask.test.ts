import { describe, it, expect } from 'vitest';
import { maskWebhook, maskEmail } from '../src/observability/notifier.js';

describe('masquage des secrets dans les logs', () => {
    it('maskWebhook ne révèle pas le chemin (token) du webhook', () => {
        const masked = maskWebhook('https://hooks.slack.com/services/T00/B00/SECRETTOKEN');
        expect(masked).toBe('https://hooks.slack.com/***');
        expect(masked).not.toContain('SECRETTOKEN');
    });

    it('maskWebhook gère une URL invalide', () => {
        expect(maskWebhook('pas-une-url')).toBe('***');
    });

    it('maskEmail masque la partie locale', () => {
        expect(maskEmail('camille@exemple.fr')).toBe('c***@exemple.fr');
        expect(maskEmail('x')).toBe('***');
    });
});
