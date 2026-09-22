import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, parseAppRoute, routesEqual, serializeAppRoute } from './appUrl';

describe('parseAppRoute', () => {
    it('lit vue, pôle, agent et mode édition', () => {
        const route = parseAppRoute('?v=orchestration&pole=drh&agent=a1&edit=1');
        expect(route.view).toBe('orchestration');
        expect(route.poleKey).toBe('drh');
        expect(route.agentId).toBe('a1');
        expect(route.editMode).toBe(true);
    });

    it('retombe sur la vue par défaut plutôt que de casser', () => {
        expect(parseAppRoute('?v=inexistante').view).toBe('orgchart');
        expect(parseAppRoute('').view).toBe('orgchart');
    });
});

describe('serializeAppRoute', () => {
    /**
     * Risque couvert : perdre `?invite=` empêcherait un invité de rejoindre son
     * workspace. Le flux d'invitation lit ce paramètre au chargement.
     */
    it('préserve les paramètres étrangers, dont le jeton d’invitation', () => {
        const search = serializeAppRoute(
            { ...DEFAULT_ROUTE, view: 'members' },
            '?invite=tok-123&utm_source=mail',
        );
        const params = new URLSearchParams(search);
        expect(params.get('invite')).toBe('tok-123');
        expect(params.get('utm_source')).toBe('mail');
        expect(params.get('v')).toBe('members');
    });

    it('n’écrit pas la vue par défaut — l’URL racine reste propre', () => {
        expect(serializeAppRoute(DEFAULT_ROUTE, '')).toBe('');
    });

    it('fait un aller-retour fidèle', () => {
        const route = {
            view: 'settings' as const,
            poleKey: 'technique',
            agentId: 'a-42',
            nodeId: null,
            editMode: true,
        };
        expect(routesEqual(parseAppRoute(serializeAppRoute(route, '')), route)).toBe(true);
    });

    it('retire une clé devenue vide au lieu de la laisser traîner', () => {
        const search = serializeAppRoute(DEFAULT_ROUTE, '?v=members&pole=drh&edit=1');
        expect(search).toBe('');
    });
});
