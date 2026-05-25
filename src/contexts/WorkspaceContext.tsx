import { createContext, useContext, type ReactNode } from 'react';
import { useSession } from '../hooks/useSession';
import { useWorkspace, type WorkspaceWithRole } from '../hooks/useWorkspace';

interface WorkspaceContextValue {
    userId: string | null;
    workspaces: WorkspaceWithRole[];
    activeId: string | null;
    activeWorkspace: WorkspaceWithRole | null;
    setActive: (id: string) => void;
    refresh: () => Promise<WorkspaceWithRole[]>;
    loading: boolean;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const { session } = useSession();
    const userId = session?.user.id ?? null;
    const { workspaces, activeId, setActive, refresh, loading } = useWorkspace(
        userId ?? undefined,
    );

    const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;

    return (
        <Ctx.Provider
            value={{ userId, workspaces, activeId, activeWorkspace, setActive, refresh, loading }}
        >
            {children}
        </Ctx.Provider>
    );
}

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
    return useContext(Ctx) ?? DEFAULT_CTX;
}
