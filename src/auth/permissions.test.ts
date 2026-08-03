import { describe, expect, it } from 'vitest';
import { can, isAdminRole, permissionsForRole, type Permission } from './permissions';

/**
 * Risque couvert : un rôle conserve une commande dont l'appel finira en 403
 * muet (ou l'inverse — un rôle légitime perd une commande).
 *
 * Le tableau ci-dessous reproduit `scopesForRole` de
 * `orchestrator/src/api/scopes.ts`. Il n'est PAS importé : ce fichier utilise
 * une propriété de paramètre de constructeur, incompatible avec
 * `erasableSyntaxOnly` du tsconfig de la SPA. Toute évolution de la table côté
 * orchestrateur doit donc être reportée ici — c'est ce que ce test verrouille.
 */
const SCOPES_FOR_ROLE: Record<string, readonly Permission[]> = {
    owner: [
        'graph:read',
        'graph:write',
        'node:read',
        'node:run',
        'execution:read',
        'human:approve',
        'human:reject',
        'node:reset',
        'workspace:admin',
    ],
    admin: [
        'graph:read',
        'graph:write',
        'node:read',
        'node:run',
        'execution:read',
        'human:approve',
        'human:reject',
        'node:reset',
        'workspace:admin',
    ],
    member: [
        'graph:read',
        'graph:write',
        'node:read',
        'node:run',
        'execution:read',
        'human:approve',
        'human:reject',
        'node:reset',
    ],
    viewer: ['graph:read', 'node:read', 'execution:read'],
};

describe('permissions', () => {
    it('reproduit scopesForRole de l’orchestrateur pour les quatre rôles', () => {
        (['owner', 'admin', 'member', 'viewer'] as const).forEach((role) => {
            const granted = permissionsForRole(role);
            const expected = SCOPES_FOR_ROLE[role]!;

            expected.forEach((scope) => {
                expect(granted, `${role} doit porter ${scope}`).toContain(scope);
            });

            // Aucun scope de l'orchestrateur accordé en trop.
            const extras = granted.filter(
                (p) => !expected.includes(p) && p !== 'members:manage' && p !== 'apikeys:manage',
            );
            expect(extras, `${role} ne doit pas porter ${extras.join(', ')}`).toEqual([]);
        });
    });

    it('interdit au viewer toute écriture et toute décision humaine', () => {
        expect(can('viewer', 'graph:write')).toBe(false);
        expect(can('viewer', 'human:approve')).toBe(false);
        expect(can('viewer', 'human:reject')).toBe(false);
        expect(can('viewer', 'node:run')).toBe(false);
        expect(can('viewer', 'graph:read')).toBe(true);
    });

    it('accorde la validation humaine au member mais pas l’administration', () => {
        expect(can('member', 'human:approve')).toBe(true);
        expect(can('member', 'node:reset')).toBe(true);
        expect(can('member', 'workspace:admin')).toBe(false);
        expect(can('member', 'members:manage')).toBe(false);
        expect(can('member', 'apikeys:manage')).toBe(false);
    });

    it('n’accorde rien à un rôle absent ou inconnu', () => {
        expect(permissionsForRole(null)).toEqual([]);
        expect(permissionsForRole(undefined)).toEqual([]);
        expect(can(null, 'graph:read')).toBe(false);
        expect(isAdminRole(null)).toBe(false);
    });
});
