import { createContext, useContext } from 'react';
import type { WorkspaceWithRole } from '../hooks/useWorkspace';

export interface WorkspaceContextValue {
    userId: string | null;
    workspaces: WorkspaceWithRole[];
    activeId: string | null;
    activeWorkspace: WorkspaceWithRole | null;
    setActive: (id: string) => void;
    refresh: () => Promise<WorkspaceWithRole[]>;
    loading: boolean;
}

// Le composant `WorkspaceProvider` vit dans un fichier séparé (WorkspaceProvider.tsx)
// pour que ce module n'exporte que le contexte + le hook (Fast Refresh / react-refresh).
export const WorkspaceCtx = createContext<WorkspaceContextValue | null>(null);

const DEFAULT_CTX: WorkspaceContextValue = {
    userId: null,
    workspaces: [],
    activeId: null,
    activeWorkspace: null,
    setActive: () => {},
    refresh: async () => [],
    loading: false,
};

/**
 * Hors d'un `<WorkspaceProvider>` (tests, mode offline), renvoie un contexte
 * vide cohérent au lieu de jeter — le repo bascule en fallback localStorage.
 */
export function useWorkspaceContext(): WorkspaceContextValue {
    return useContext(WorkspaceCtx) ?? DEFAULT_CTX;
}
