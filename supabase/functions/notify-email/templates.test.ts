import { describe, expect, it } from 'vitest';
import { parseAppRoute } from '../../../src/routing/appUrl';
import { buildHitlEmail } from './templates.ts';

const DATA = {
    nodeName: 'Arbitre',
    roleTitle: 'Décision',
    nodeId: 'nœud 1',
    fromStatus: 'EXECUTING',
    toStatus: 'WAITING_HUMAN_APPROVAL',
    appUrl: 'https://organigrad.app',
};

/** Relit un lien avec le routeur réel de la SPA. */
function routeOf(link: string) {
    return parseAppRoute(new URL(link).search);
}

describe('notify-email — lien « Ouvrir le Centre de validation »', () => {
    it('le bouton HTML ouvre la vue Orchestration sur le nœud', () => {
        const { html } = buildHitlEmail(DATA);
        const href = /href="([^"]+)"/.exec(html)?.[1].replace(/&amp;/g, '&');
        expect(href).toBeDefined();
        expect(routeOf(href!)).toMatchObject({ view: 'orchestration', nodeId: 'nœud 1' });
    });

    it('le lien de la version texte ouvre la vue Orchestration sur le nœud', () => {
        const { text } = buildHitlEmail(DATA);
        const link = /Lien : (\S+)/.exec(text)?.[1];
        expect(link).toBeDefined();
        expect(routeOf(link!)).toMatchObject({ view: 'orchestration', nodeId: 'nœud 1' });
    });

    it('sans appUrl, aucun lien n\'est produit', () => {
        const { html, text } = buildHitlEmail({ ...DATA, appUrl: undefined });
        expect(html).not.toContain('href=');
        expect(text).not.toContain('Lien :');
    });
});
