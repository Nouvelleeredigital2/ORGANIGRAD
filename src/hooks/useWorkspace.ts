import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Database, WorkspaceRole } from '../types/supabase';

type WorkspaceRow = Database['public']['Tables']['workspaces']['Row'];

export interface WorkspaceWithRole extends WorkspaceRow {
    role: WorkspaceRole;
}

const ACTIVE_KEY = 'organigrad_active_workspace_id';

/**
 * Hook workspace — liste les workspaces accessibles par le user courant,
 * et expose le workspace actif (persisté en localStorage).
 *
 * Requiert une session authentifiée ; renvoie `[]` sinon.
 */
/** Lecture défensive : un accès localStorage bloqué (navigation privée
 * stricte, quota) ne doit jamais faire planter le montage du hook. */
function readStoredActiveId(): string | null {
    try {
        return localStorage.getItem(ACTIVE_KEY);
    } catch {
        return null;
    }
}

function writeStoredActiveId(id: string): void {
    try {
        localStorage.setItem(ACTIVE_KEY, id);
    } catch {
        /* stockage indisponible — l'id actif reste correct pour la session en cours */
    }
}

export function useWorkspace(userId: string | undefined): {
    workspaces: WorkspaceWithRole[];
    activeId: string | null;
    setActive: (id: string) => void;
    refresh: () => Promise<WorkspaceWithRole[]>;
    loading: boolean;
    /**
     * Message d'échec du dernier `refresh()`, ou `null`. Avant ce correctif,
     * un échec de lecture (RLS, réseau) rendait la liste des workspaces vide
     * SANS AUCUN signal utilisateur — indiscernable d'un compte sans
     * workspace. Audit P2.
     */
    error: string | null;
} {
    const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
    // Miroir synchrone de `workspaces`, lu dans le `catch` de `refresh` (repli
    // sur la liste déjà affichée en cas d'échec) sans avoir à déclarer
    // `workspaces` en dépendance de `refresh` — ça le recréerait à chaque
    // rendu, et donc l'effet de montage qui l'appelle, en boucle.
    const workspacesRef = useRef<WorkspaceWithRole[]>([]);
    const [activeId, setActiveId] = useState<string | null>(readStoredActiveId);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async (): Promise<WorkspaceWithRole[]> => {
        if (!supabase || !userId) {
            setWorkspaces([]);
            setError(null);
            return [];
        }
        setLoading(true);
        try {
            // Filtre user_id indispensable : la policy « wm read members »
            // expose les lignes de TOUS les co-membres des workspaces où l'on
            // est membre. Sans ce filtre, chaque workspace apparaît en doublon
            // et le rôle affiché est celui de la plus ancienne ligne — l'owner.
            const { data, error: sbError } = await supabase
                .from('workspace_members')
                .select('role, workspace:workspaces(*)')
                .eq('user_id', userId)
                .order('created_at', { ascending: true });
            if (sbError) throw sbError;
            const list: WorkspaceWithRole[] = (data ?? [])
                .map((row) => {
                    const ws = (row.workspace as unknown) as WorkspaceRow | null;
                    return ws ? { ...ws, role: row.role } : null;
                })
                .filter((x): x is WorkspaceWithRole => x !== null);
            setWorkspaces(list);
            workspacesRef.current = list;
            setError(null);
            // Si l'activeId stocké n'est plus accessible, retombe sur le 1er
            // — et persiste ce nouveau choix (sinon, au prochain chargement,
            // on relit encore l'id périmé depuis localStorage).
            setActiveId((current) => {
                if (current && list.some((w) => w.id === current)) return current;
                const fallback = list[0]?.id ?? null;
                if (fallback) writeStoredActiveId(fallback);
                return fallback;
            });
            return list;
        } catch (err) {
            setError(
                err instanceof Error
                    ? `Chargement des workspaces impossible : ${err.message}`
                    : 'Chargement des workspaces impossible.',
            );
            return workspacesRef.current;
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const setActive = useCallback((id: string) => {
        setActiveId(id);
        writeStoredActiveId(id);
    }, []);

    return { workspaces, activeId, setActive, refresh, loading, error };
}
