import { type ReactNode } from 'react';
import { useSession } from '../hooks/useSession';
import { useWorkspace } from '../hooks/useWorkspace';
import { WorkspaceCtx } from './WorkspaceContext';

/**
 * Provider du contexte workspace. Séparé de `WorkspaceContext.tsx` pour que ce
 * dernier n'exporte que le contexte + le hook (compatibilité React Fast Refresh).
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const { session } = useSession();
    const userId = session?.user.id ?? null;
    const { workspaces, activeId, setActive, refresh, loading } = useWorkspace(
        userId ?? undefined,
    );

    const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;

    return (
        <WorkspaceCtx.Provider
            value={{ userId, workspaces, activeId, activeWorkspace, setActive, refresh, loading }}
        >
            {children}
        </WorkspaceCtx.Provider>
    );
}
