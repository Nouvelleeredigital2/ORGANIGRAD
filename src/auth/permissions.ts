/**
 * Modèle de permissions côté SPA.
 *
 * SOURCE DE VÉRITÉ : `orchestrator/src/api/scopes.ts` (`scopesForRole`). Ce
 * fichier en est un miroir, pas une seconde définition : l'orchestrateur est un
 * paquet séparé et `tsconfig.app.json` ne couvre que `src/`, il n'est donc pas
 * importable. Le test `permissions.test.ts` verrouille la parité — si les deux
 * tables divergent, il échoue.
 *
 * Rôle de ce module : décider ce que l'interface AFFICHE. L'autorisation réelle
 * reste appliquée par la RLS Postgres et par l'orchestrateur. Masquer un bouton
 * n'est pas une protection ; c'est la garantie qu'on ne propose pas une action
 * qui finirait en 403 muet.
 */

import type { WorkspaceRole } from '../types/supabase';

export type { WorkspaceRole };

/** Miroir de `SCOPES` (orchestrateur) + permissions propres à la SPA. */
export type Permission =
    // — alignées sur scopesForRole
    | 'graph:read'
    | 'graph:write'
    | 'node:read'
    | 'node:run'
    | 'execution:read'
    | 'human:approve'
    | 'human:reject'
    | 'node:reset'
    | 'workspace:admin'
    // — propres à la SPA, dérivées de workspace:admin
    | 'members:manage'
    | 'apikeys:manage';

const READ_ONLY: readonly Permission[] = ['graph:read', 'node:read', 'execution:read'];

/** Tout sauf les permissions d'administration du workspace. */
const MEMBER: readonly Permission[] = [
    ...READ_ONLY,
    'graph:write',
    'node:run',
    'human:approve',
    'human:reject',
    'node:reset',
];

const ADMIN: readonly Permission[] = [...MEMBER, 'workspace:admin', 'members:manage', 'apikeys:manage'];

/**
 * Permissions d'un rôle. Un rôle inconnu ou absent ne donne RIEN — c'est
 * volontaire : en cas de doute sur l'identité, l'interface se tait plutôt que
 * de proposer une action qui sera refusée.
 */
export function permissionsForRole(role: WorkspaceRole | null | undefined): readonly Permission[] {
    switch (role) {
        case 'owner':
        case 'admin':
            return ADMIN;
        case 'member':
            return MEMBER;
        case 'viewer':
            return READ_ONLY;
        default:
            return [];
    }
}

export function can(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
    return permissionsForRole(role).includes(permission);
}

/** Raccourci owner|admin — remplace les tests ad hoc dupliqués dans les vues. */
export function isAdminRole(role: WorkspaceRole | null | undefined): boolean {
    return role === 'owner' || role === 'admin';
}
