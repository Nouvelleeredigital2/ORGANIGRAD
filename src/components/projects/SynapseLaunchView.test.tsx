import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SynapseLaunchView } from './SynapseLaunchView';

const mocks = vi.hoisted(() => ({ setActive: vi.fn(), fetch: vi.fn() }));
vi.mock('../../hooks/useSession', () => ({ useSession: () => ({ loading: false, session: { access_token: 'human-token', user: { id: 'user-a' } } }) }));
vi.mock('../../contexts/WorkspaceContext', () => ({ useWorkspaceContext: () => ({
    userId: 'user-a', activeId: 'ws-a', activeWorkspace: { id: 'ws-a', name: 'Espace A', role: 'owner' },
    workspaces: [{ id: 'ws-a', name: 'Espace A', role: 'owner' }, { id: 'ws-b', name: 'Espace B', role: 'member' }],
    setActive: mocks.setActive, refresh: vi.fn(), loading: false, error: null,
}) }));

describe('SynapseLaunchView', () => {
    beforeEach(() => {
        vi.restoreAllMocks(); mocks.fetch.mockReset(); mocks.setActive.mockReset();
        window.history.replaceState({}, '', `/synapse/launch?code=${'A'.repeat(43)}`);
    });

    it('demande un choix explicite puis ouvre avec le JWT et le workspace sélectionné', async () => {
        mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ redirect: '/?v=projects' }), { status: 200 }));
        const navigate = vi.fn();
        render(<SynapseLaunchView fetcher={mocks.fetch} navigate={navigate} />);
        expect(screen.getByRole('heading', { name: /ouvrir le projet synapse/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /espace b/i }));
        fireEvent.click(screen.getByRole('button', { name: /continuer/i }));
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/synapse/suite/launch'), expect.objectContaining({
            method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer human-token', 'x-workspace-id': 'ws-b' }),
        })));
        expect(mocks.setActive).toHaveBeenCalledWith('ws-b');
        expect(navigate).toHaveBeenCalledWith('/?v=projects');
    });

    it('refuse un code absent ou invalide sans appel réseau', () => {
        window.history.replaceState({}, '', '/synapse/launch?code=bad');
        render(<SynapseLaunchView fetcher={mocks.fetch} />);
        expect(screen.getByRole('alert')).toHaveTextContent(/invalide/i);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
});
