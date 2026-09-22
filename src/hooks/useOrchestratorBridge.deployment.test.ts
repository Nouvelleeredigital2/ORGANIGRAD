import { afterEach, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { OrchestratorClient } from '../services/orchestratorService';
import { useOrchestratorBridge } from './useOrchestratorBridge';

vi.mock('./useOrchestratorConfig', () => ({ useOrchestratorConfig: () => ({
    config: { baseUrl: 'https://old.example/api', apiKey: 'ok_legacy' }, isConfigured: true,
}) }));
const workspace = vi.hoisted(() => ({ activeId: 'workspace-a', userId: 'human-a' }));
vi.mock('../contexts/WorkspaceContext', () => ({ useWorkspaceContext: () => workspace }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: {
    session: { access_token: 'current-session', user: { id: 'human-a' } },
} }) } } }));

afterEach(() => { workspace.activeId = 'workspace-a'; vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('connects the deployed workspace using the human session, ignoring legacy browser credentials', async () => {
    vi.stubEnv('VITE_ORCHESTRATOR_URL', 'https://organigrad.example');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ nodes: [] })));
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(OrchestratorClient.prototype, 'subscribe').mockReturnValue(() => {});
    const { result, unmount } = renderHook(() => useOrchestratorBridge());
    await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    expect(fetcher).toHaveBeenCalledWith('https://organigrad.example/api/graph', expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer current-session', 'x-workspace-id': 'workspace-a' }),
    }));
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('https://organigrad.example/api/'))).toBe(true);
    unmount();
});

it('does not fall back to the editable legacy destination when deployment configuration is invalid', async () => {
    vi.stubEnv('VITE_ORCHESTRATOR_URL', 'http://untrusted.example');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { result, unmount } = renderHook(() => useOrchestratorBridge());
    await waitFor(() => expect(result.current.connectionState).toBe('failed'));
    expect(fetcher).not.toHaveBeenCalled(); unmount();
});

it('clears the previous workspace graph and client while the next workspace is loading', async () => {
    vi.stubEnv('VITE_ORCHESTRATOR_URL', 'https://organigrad.example');
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ nodes: [{ id: 'private-a' }] })));
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(OrchestratorClient.prototype, 'subscribe').mockReturnValue(() => {});
    const { result, rerender, unmount } = renderHook(() => useOrchestratorBridge());
    await waitFor(() => expect(result.current.connected).toBe(true));
    fetcher.mockImplementation(() => new Promise(() => {}));
    workspace.activeId = 'workspace-b'; rerender();
    await waitFor(() => expect(result.current.connectionState).toBe('connecting'));
    expect(result.current.connected).toBe(false);
    expect(result.current.nodes).toEqual([]);
    expect(result.current.client).toBeNull();
    unmount();
});
