import { useMemo } from 'react';
import { useWorkspaceContext } from '../contexts/WorkspaceContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { can as canForRole, isAdminRole, type Permission, type WorkspaceRole } from './permissions';

export interface PermissionsApi {
    /** Rôle du membre dans le workspace actif, `null` en mode local. */
    role: WorkspaceRole | null;
    can: (permission: Permission) => boolean;
    /** Raccourci owner|admin. */
    isAdmin: boolean;
    /** `true` quand aucune notion de rôle n'existe (pas de Supabase configuré). */
    isLocalMode: boolean;
}

/**
 * Permissions de l'utilisateur courant, pour décider ce que l'interface propose.
 *
 * Mode local (`isSupabaseConfigured === false`) : il n'y a ni compte, ni
 * workspace, ni RLS — les données vivent en localStorage sur ce poste. Tout est
 * donc permis, sinon le mode hors-ligne officiellement supporté n'aurait plus
 * aucune commande.
 */
export function usePermissions(): PermissionsApi {
    const { activeWorkspace } = useWorkspaceContext();
    const isLocalMode = !isSupabaseConfigured;
    const role = activeWorkspace?.role ?? null;

    return useMemo(
        () => ({
            role,
            isLocalMode,
            isAdmin: isLocalMode || isAdminRole(role),
            can: (permission: Permission) => (isLocalMode ? true : canForRole(role, permission)),
        }),
        [role, isLocalMode],
    );
}
