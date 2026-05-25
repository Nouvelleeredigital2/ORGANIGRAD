import { useCallback, useEffect, useState } from 'react';
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
export function useWorkspace(userId: string | undefined): {
    workspaces: WorkspaceWithRole[];
    activeId: string | null;
    setActive: (id: string) => void;
    refresh: () => Promise<WorkspaceWithRole[]>;
    loading: boolean;
} {
    const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
    const [activeId, setActiveId] = useState<string | null>(
        () => localStorage.getItem(ACTIVE_KEY),
    );
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async (): Promise<WorkspaceWithRole[]> => {
        if (!supabase || !userId) {
            setWorkspaces([]);
            return [];
        }
        setLoading(true);
        try {
            // RLS limite naturellement aux workspaces où auth.uid() est membre
            const { data, error } = await supabase
                .from('workspace_members')
                .select('role, workspace:workspaces(*)')
                .order('created_at', { ascending: true });
            if (error) throw error;
            const list: WorkspaceWithRole[] = (data ?? [])
                .map((row) => {
                    const ws = (row.workspace as unknown) as WorkspaceRow | null;
                    return ws ? { ...ws, role: row.role } : null;
                })
                .filter((x): x is WorkspaceWithRole => x !== null);
            setWorkspaces(list);
            // Si l'activeId stocké n'est plus accessible, retombe sur le 1er
            setActiveId((current) => {
                if (current && list.some((w) => w.id === current)) return current;
                return list[0]?.id ?? null;
            });
            return list;
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const setActive = useCallback((id: string) => {
        setActiveId(id);
        localStorage.setItem(ACTIVE_KEY, id);
    }, []);

    return { workspaces, activeId, setActive, refresh, loading };
}
