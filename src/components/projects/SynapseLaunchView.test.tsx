import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SynapseLaunchView } from './SynapseLaunchView';

const encode = (value: string) => btoa(value).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
const signedShape = (header: Record<string, unknown>) =>
    `${encode(JSON.stringify(header))}.${encode('{}')}.${'A'.repeat(86)}`;
const SYNAPSE_JWS_SHAPE = signedShape({ alg: 'EdDSA', typ: 'synapse-launch+jws' });

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

    it('transmet au backend, sans le modifier, la forme JWS compacte émise par Synapse', async () => {
        const code = SYNAPSE_JWS_SHAPE;
        window.history.replaceState({}, '', `/synapse/launch?code=${encodeURIComponent(code)}`);
        mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ redirect: '/?v=projects' }), { status: 200 }));
        const navigate = vi.fn();
        render(<SynapseLaunchView fetcher={mocks.fetch} navigate={navigate} />);
        fireEvent.click(screen.getByRole('button', { name: /espace b/i }));
        fireEvent.click(screen.getByRole('button', { name: /continuer/i }));
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
        const request = mocks.fetch.mock.calls[0]![1] as RequestInit;
        expect(JSON.parse(String(request.body))).toEqual({ code });
        expect(navigate).toHaveBeenCalledWith('/?v=projects');
    });

    it.each([
        ['un type JWS différent', signedShape({ alg: 'EdDSA', typ: 'other' })],
        ['un ticket trop long', 'A'.repeat(4097)],
    ])('refuse %s avant tout appel réseau', (_, code) => {
        window.history.replaceState({}, '', `/synapse/launch?code=${encodeURIComponent(code)}`);
        render(<SynapseLaunchView fetcher={mocks.fetch} />);
        expect(screen.getByRole('alert')).toHaveTextContent(/invalide/i);
        expect(screen.getByRole('button', { name: /continuer/i })).toBeDisabled();
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it('refuse un code absent ou invalide sans appel réseau', () => {
        window.history.replaceState({}, '', '/synapse/launch?code=bad');
        render(<SynapseLaunchView fetcher={mocks.fetch} />);
        expect(screen.getByRole('alert')).toHaveTextContent(/invalide/i);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
});
