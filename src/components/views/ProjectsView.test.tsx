import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectTask } from '../../types/project';
import type { WorkspaceRole } from '../../types/supabase';

const mocks = vi.hoisted(() => ({
    workspaceId: '11111111-1111-4111-8111-111111111111',
    userId: '44444444-4444-4444-8444-444444444444',
    accessToken: 'token-a',
    role: 'member' as WorkspaceRole,
    workspaceLoading: false,
    workspaceUnavailable: false,
    workspaceError: null as string | null,
    refresh: vi.fn(),
    setActive: vi.fn(),
    repo: { getRole: vi.fn(), listProjects: vi.fn(), getProject: vi.fn(), listTasks: vi.fn(), listMembers: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), createTask: vi.fn(), updateTask: vi.fn() },
}));
vi.mock('../../hooks/useSession', () => ({ useSession: () => ({ session: mocks.userId ? { user: { id: mocks.userId }, access_token: mocks.accessToken } : null, loading: false }) }));
vi.mock('../../contexts/WorkspaceContext', () => ({ useWorkspaceContext: () => ({ userId: mocks.userId, activeId: mocks.workspaceId, activeWorkspace: mocks.workspaceUnavailable ? null : { id: mocks.workspaceId, name: 'Espace actuel', role: mocks.role }, workspaces: [{ id: mocks.workspaceId, name: 'Espace actuel', role: mocks.role }, { id: '55555555-5555-4555-8555-555555555555', name: 'Autre espace', role: 'viewer' }], setActive: mocks.setActive, refresh: mocks.refresh, loading: mocks.workspaceLoading, error: mocks.workspaceError }) }));
vi.mock('../../services/projectRepo', async importOriginal => ({ ...await importOriginal<typeof import('../../services/projectRepo')>(), createProjectRepo: () => mocks.repo }));

import { ProjectsView } from './ProjectsView';
import { Sidebar } from '../layout/Sidebar';

const project: Project = { id: '22222222-2222-4222-8222-222222222222', workspace_id: mocks.workspaceId, name: 'Projet pilote', description: 'Description réelle', archived_at: null, created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z', version: 1 };
const task: ProjectTask = { id: '33333333-3333-4333-8333-333333333333', workspace_id: mocks.workspaceId, project_id: project.id, title: 'Préparer la réunion', description: 'Ordre du jour', status: 'todo', assignee_id: mocks.userId, due_date: '2026-09-15', archived_at: null, created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z', version: 1 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const deepLink = () => window.history.replaceState(null, '', `/?v=projects&workspace=${mocks.workspaceId}&project=${project.id}`);

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_PROJECTS_ENABLED', 'true');
    vi.stubEnv('VITE_PRIVATE_PROJECTS_ENABLED', 'false');
    mocks.workspaceId = project.workspace_id;
    mocks.userId = '44444444-4444-4444-8444-444444444444';
    mocks.accessToken = 'token-a';
    mocks.role = 'member';
    mocks.workspaceLoading = false;
    mocks.workspaceUnavailable = false;
    mocks.workspaceError = null;
    mocks.refresh.mockResolvedValue([]);
    window.history.replaceState(null, '', '/?v=projects');
    mocks.repo.getRole.mockResolvedValue('member');
    mocks.repo.listProjects.mockResolvedValue([]);
    mocks.repo.getProject.mockResolvedValue(project);
    mocks.repo.listTasks.mockResolvedValue([task]);
    mocks.repo.listMembers.mockResolvedValue([{ id: mocks.userId, label: 'Camille du profil' }]);
    mocks.repo.createProject.mockResolvedValue(project);
    mocks.repo.updateProject.mockResolvedValue({ ...project, version: 2 });
    mocks.repo.createTask.mockResolvedValue(task);
    mocks.repo.updateTask.mockResolvedValue({ ...task, version: 2, status: 'done' });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('personal Synapse access lifecycle', () => {
    const tokenId = '88888888-8888-4888-8888-888888888888';
    const secret = `ogp_${'b'.repeat(64)}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    const issuance = () => new Response(JSON.stringify({ id: tokenId, token: secret, workspace: mocks.workspaceId, projectId: project.id, scopes: ['projects:read'], expiresAt }), { status: 201 });
    const row = { id: tokenId, name: 'Mon Synapse', prefix: secret.slice(0, 12), expiresAt, createdAt: '2026-09-09T10:00:00Z', revokedAt: null };
    const fetcher = vi.fn<typeof fetch>();
    const writeText = vi.fn();
    beforeEach(() => {
        deepLink();
        vi.stubEnv('VITE_PRIVATE_PROJECTS_ENABLED', 'true');
        vi.stubEnv('VITE_ORCHESTRATOR_URL', 'https://orchestrator.example.test');
        mocks.accessToken = 'human.session.signature';
        fetcher.mockReset().mockImplementation(async (_url, init) => init?.method === 'POST' ? issuance() : new Response(JSON.stringify({ tokens: [] })));
        vi.stubGlobal('fetch', fetcher);
        writeText.mockReset().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    });
    const open = async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'Accès Synapse' }));
        await screen.findByText('Aucun accès personnel pour ce projet.');
    };
    const submit = () => {
        fireEvent.change(screen.getByLabelText('Nom de l’accès'), { target: { value: 'Mon Synapse' } });
        fireEvent.submit(screen.getByRole('button', { name: 'Créer l’accès' }).closest('form')!);
    };
    it('issues once on double submit, masks by default, shows actual expiry, and never writes secrets to persistence/URL/clipboard', async () => {
        const pending = deferred<Response>();
        render(<ProjectsView />);
        await open();
        const persistence = vi.spyOn(Storage.prototype, 'setItem');
        fetcher.mockReturnValueOnce(pending.promise);
        submit();
        fireEvent.submit(screen.getByRole('button', { name: 'Créer l’accès' }).closest('form')!);
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
        await act(async () => pending.resolve(issuance()));
        expect(await screen.findByText('Secret masqué')).toBeInTheDocument();
        const connection = within(screen.getByRole('region', { name: 'Accès créé' }));
        expect(connection.getByText(mocks.userId)).toBeInTheDocument();
        expect(connection.getByText(mocks.workspaceId)).toBeInTheDocument();
        expect(connection.getByText(project.id)).toBeInTheDocument();
        expect(document.body.innerHTML).not.toContain(secret);
        expect(screen.getByText(/expiration effective/i).querySelector('time')).toHaveAttribute('dateTime', new Date(expiresAt * 1000).toISOString());
        fireEvent.click(screen.getByRole('button', { name: 'Révéler le secret' }));
        expect(screen.getByText(secret)).toBeInTheDocument();
        expect(writeText).not.toHaveBeenCalled();
        expect(persistence).not.toHaveBeenCalled();
        expect(window.location.href).not.toContain(secret);
        expect(window.location.href).not.toContain(mocks.accessToken);
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(document.body.innerHTML).not.toContain(secret);
        await open();
        expect(screen.queryByRole('button', { name: 'Révéler le secret' })).not.toBeInTheDocument();
    });
    it.each(['workspace', 'user', 'session', 'role', 'project', 'unmount', 'close', 'membership', 'logout'])('discards an old POST after %s and never resurrects its secret', async dimension => {
        const pending = deferred<Response>();
        const view = render(<ProjectsView />);
        await open();
        fetcher.mockReturnValueOnce(pending.promise);
        submit();
        const oldResponse = issuance();
        const read = vi.spyOn(oldResponse, 'json');
        if (dimension === 'membership') mocks.workspaceUnavailable = true;
        if (dimension === 'logout') mocks.userId = '';
        if (dimension === 'workspace') mocks.workspaceId = '55555555-5555-4555-8555-555555555555';
        if (dimension === 'user') mocks.userId = '77777777-7777-4777-8777-777777777777';
        if (dimension === 'session') mocks.accessToken = 'human.new.signature';
        if (dimension === 'role') mocks.role = 'viewer';
        if (dimension === 'project') act(() => { window.history.replaceState(null, '', '/?v=projects'); window.dispatchEvent(new PopStateEvent('popstate')); });
        if (dimension === 'unmount') view.unmount();
        else if (dimension === 'close') fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        else view.rerender(<ProjectsView />);
        await act(async () => pending.resolve(oldResponse));
        expect(read).not.toHaveBeenCalled();
        expect(document.body.innerHTML).not.toContain(secret);
        expect(screen.queryByRole('button', { name: 'Révéler le secret' })).not.toBeInTheDocument();
        expect(writeText).not.toHaveBeenCalled();
    });
    it.each(['workspace', 'user', 'session', 'role', 'project', 'unmount', 'membership', 'logout'])('clears an already revealed secret on %s', async dimension => {
        const view = render(<ProjectsView />);
        await open(); submit();
        fireEvent.click(await screen.findByRole('button', { name: 'Révéler le secret' }));
        expect(screen.getByText(secret)).toBeInTheDocument();
        if (dimension === 'membership') mocks.workspaceUnavailable = true;
        if (dimension === 'logout') mocks.userId = '';
        if (dimension === 'workspace') mocks.workspaceId = '55555555-5555-4555-8555-555555555555';
        if (dimension === 'user') mocks.userId = '77777777-7777-4777-8777-777777777777';
        if (dimension === 'session') mocks.accessToken = 'human.new.signature';
        if (dimension === 'role') mocks.role = 'viewer';
        if (dimension === 'project') act(() => { window.history.replaceState(null, '', '/?v=projects'); window.dispatchEvent(new PopStateEvent('popstate')); });
        if (dimension === 'unmount') view.unmount(); else view.rerender(<ProjectsView />);
        expect(document.body.innerHTML).not.toContain(secret);
    });
    it('keeps loading distinct from empty/error and paginates metadata with confirmation before revoke', async () => {
        const pending = deferred<Response>();
        fetcher.mockReturnValueOnce(pending.promise);
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Accès Synapse' }));
        expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('Chargement des accès');
        await act(async () => pending.resolve(new Response(JSON.stringify({ tokens: [row], nextCursor: tokenId }))));
        expect(screen.getByText(row.name)).toBeInTheDocument();
        fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ tokens: [{ ...row, id: task.id, name: 'Autre accès' }] })));
        fireEvent.click(screen.getByRole('button', { name: 'Afficher la suite' }));
        expect(await screen.findByText('Autre accès')).toBeInTheDocument();
        expect(fetcher.mock.calls[1]![0]).toContain(`cursor=${tokenId}`);
        fireEvent.click(screen.getByRole('button', { name: `Révoquer ${row.name}` }));
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler la révocation' }));
        fireEvent.click(screen.getByRole('button', { name: `Révoquer ${row.name}` }));
        fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la révocation' }));
        expect(await screen.findByText('Accès révoqué.')).toBeInTheDocument();
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    });
    it('displays a generic load error and supports retry without invented rows', async () => {
        fetcher.mockRejectedValueOnce(new Error(secret));
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Accès Synapse' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Accès Synapse indisponible');
        expect(document.body.innerHTML).not.toContain(secret);
        expect(screen.queryByText('Aucun accès personnel pour ce projet.')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Réessayer la liste' }));
        expect(await screen.findByText('Aucun accès personnel pour ce projet.')).toBeInTheDocument();
    });
    it('never retries an uncertain POST automatically or on repeated submission', async () => {
        render(<ProjectsView />);
        await open();
        fetcher.mockRejectedValueOnce(new Error(secret));
        submit();
        expect(await screen.findByRole('alert')).toHaveTextContent(/création non confirmée/i);
        fireEvent.submit(screen.getByRole('button', { name: 'Créer l’accès' }).closest('form')!);
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    });
    it('preserves the secret through same-identity focus refresh and failed revalidation, while gating actions', async () => {
        const view = render(<ProjectsView />);
        await open(); submit();
        await screen.findByText('Secret masqué');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Actualiser les accès' })).toBeEnabled());
        const dialog = screen.getByRole('dialog');
        const requests = fetcher.mock.calls.length;
        mocks.workspaceLoading = true;
        view.rerender(<ProjectsView />);
        expect(screen.getByRole('dialog')).toBe(dialog);
        expect(within(dialog).getByRole('status')).toHaveTextContent(/vérification/i);
        expect(screen.getByRole('button', { name: 'Révéler le secret' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Actualiser les accès' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Actualiser les accès' }));
        mocks.workspaceLoading = false;
        mocks.workspaceError = 'Vérification impossible';
        view.rerender(<ProjectsView />);
        expect(screen.getByRole('dialog')).toBe(dialog);
        expect(within(dialog).getByRole('alert')).toHaveTextContent(/vérification/i);
        expect(screen.getByRole('button', { name: 'Révéler le secret' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Accès Synapse' })).toBeDisabled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Revérifier l’accès' }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
        mocks.workspaceError = null;
        view.rerender(<ProjectsView />);
        expect(screen.getByRole('dialog')).toBe(dialog);
        expect(fetcher).toHaveBeenCalledTimes(requests);
        fireEvent.click(screen.getByRole('button', { name: 'Révéler le secret' }));
        expect(screen.getByText(secret)).toBeInTheDocument();
        expect(screen.getByLabelText('Nom de l’accès')).toHaveValue('Mon Synapse');
    });
    it('gates direct form submits during same-identity revalidation and retains the draft', async () => {
        const view = render(<ProjectsView />);
        await open();
        fireEvent.change(screen.getByLabelText('Nom de l’accès'), { target: { value: 'Brouillon Synapse' } });
        const form = screen.getByRole('button', { name: 'Créer l’accès' }).closest('form')!;
        mocks.workspaceLoading = true;
        view.rerender(<ProjectsView />);
        expect(screen.getByLabelText('Nom de l’accès')).toHaveValue('Brouillon Synapse');
        fireEvent.submit(form);
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
        mocks.workspaceLoading = false;
        view.rerender(<ProjectsView />);
        fireEvent.submit(form);
        await screen.findByText('Secret masqué');
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    });
    it('retains an open revoke confirmation across refresh but suspends the DELETE', async () => {
        fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ tokens: [row] })));
        const view = render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Accès Synapse' }));
        fireEvent.click(await screen.findByRole('button', { name: `Révoquer ${row.name}` }));
        mocks.workspaceLoading = true;
        view.rerender(<ProjectsView />);
        expect(screen.getByRole('button', { name: 'Confirmer la révocation' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la révocation' }));
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
        mocks.workspaceLoading = false;
        view.rerender(<ProjectsView />);
        fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la révocation' }));
        await screen.findByText('Accès révoqué.');
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    });
    it('preserves the new secret when two POST responses arrive in reverse order across close/reopen', async () => {
        const pending = deferred<Response>();
        render(<ProjectsView />);
        await open();
        fetcher.mockReturnValueOnce(pending.promise);
        submit();
        const oldResponse = issuance();
        const read = vi.spyOn(oldResponse, 'json');
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        await open();
        const newerSecret = `ogp_${'c'.repeat(64)}`;
        fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ id: tokenId, token: newerSecret, workspace: mocks.workspaceId, projectId: project.id, scopes: ['projects:read'], expiresAt }), { status: 201 }));
        submit();
        fireEvent.click(await screen.findByRole('button', { name: 'Révéler le secret' }));
        expect(screen.getByText(newerSecret)).toBeInTheDocument();
        await act(async () => pending.resolve(oldResponse));
        expect(read).not.toHaveBeenCalled();
        expect(screen.getByText(newerSecret)).toBeInTheDocument();
        expect(document.body.innerHTML).not.toContain(secret);
    });
    it('ignores an older GET after reopening and loading the current list', async () => {
        const pending = deferred<Response>();
        fetcher.mockReturnValueOnce(pending.promise);
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Accès Synapse' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        await open();
        await act(async () => pending.resolve(new Response(JSON.stringify({ tokens: [row] }))));
        expect(screen.queryByText(row.name)).not.toBeInTheDocument();
        expect(screen.getByText('Aucun accès personnel pour ce projet.')).toBeInTheDocument();
    });
    it('keeps existing rows on a pagination error and never claims a failed revoke succeeded', async () => {
        fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ tokens: [row], nextCursor: tokenId })));
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Accès Synapse' }));
        await screen.findByText(row.name);
        fetcher.mockRejectedValueOnce(new Error(secret));
        fireEvent.click(screen.getByRole('button', { name: 'Afficher la suite' }));
        await screen.findByRole('alert');
        expect(screen.getByText(row.name)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: `Révoquer ${row.name}` }));
        fetcher.mockResolvedValueOnce(new Response('{}', { status: 403 }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer la révocation' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmer la révocation' })).toBeEnabled());
        expect(screen.queryByText('Accès révoqué.')).not.toBeInTheDocument();
        expect(document.body.innerHTML).not.toContain(secret);
    });
    it('allows a verified viewer to issue read-only personal access', async () => {
        mocks.role = 'viewer'; mocks.repo.getRole.mockResolvedValue('viewer');
        render(<ProjectsView />);
        await open(); submit();
        expect(await screen.findByText('Secret masqué')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Modifier le projet' })).not.toBeInTheDocument();
    });
});

describe('ProjectsView', () => {
    it('offers personal Synapse access in project detail only when explicitly enabled', async () => {
        deepLink();
        const { rerender } = render(<ProjectsView />);
        await screen.findByRole('heading', { name: project.name });
        expect(screen.queryByRole('button', { name: 'Accès Synapse' })).not.toBeInTheDocument();
        vi.stubEnv('VITE_PRIVATE_PROJECTS_ENABLED', 'true');
        rerender(<ProjectsView />);
        expect(screen.getByRole('button', { name: 'Accès Synapse' })).toBeInTheDocument();
    });
    it.each(['project', 'task'] as const)('preserves an uncertain %s draft and UUID during same-boundary revalidation', async kind => {
        if (kind === 'task') deepLink();
        const create = kind === 'project' ? mocks.repo.createProject : mocks.repo.createTask;
        create.mockRejectedValueOnce(new Error('Confirmation impossible'));
        const { rerender } = render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: kind === 'project' ? 'Nouveau projet' : 'Nouvelle tâche' }));
        const label = kind === 'project' ? 'Nom' : 'Titre';
        const submit = kind === 'project' ? 'Créer le projet' : 'Créer la tâche';
        fireEvent.change(screen.getByLabelText(label), { target: { value: 'Brouillon conservé' } });
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Description conservée' } });
        fireEvent.click(screen.getByRole('button', { name: submit }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Confirmation impossible');
        const argument = kind === 'project' ? 0 : 1;
        const uuid = create.mock.calls[0]?.[argument].id;
        const form = screen.getByRole('button', { name: submit }).closest('form')!;

        mocks.workspaceLoading = true;
        rerender(<ProjectsView />);
        expect(screen.getByLabelText(label)).toHaveValue('Brouillon conservé');
        expect(screen.getByLabelText('Description')).toHaveValue('Description conservée');
        expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(/vérification/i);
        expect(screen.getByRole('button', { name: submit })).toBeDisabled();
        fireEvent.submit(form);
        expect(create).toHaveBeenCalledTimes(1);

        mocks.workspaceLoading = false;
        rerender(<ProjectsView />);
        expect(screen.getByLabelText(label)).toHaveValue('Brouillon conservé');
        expect(screen.getByRole('button', { name: submit })).toBeEnabled();
        expect(mocks.repo.getRole).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: submit }));
        await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
        expect(create.mock.calls[1]?.[argument].id).toBe(uuid);
    });
    it('preserves a draft through failed revalidation but gates writes until access succeeds', async () => {
        const { rerender } = render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Nouveau projet' }));
        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Brouillon hors ligne' } });
        const form = screen.getByRole('button', { name: 'Créer le projet' }).closest('form')!;
        mocks.workspaceLoading = true;
        rerender(<ProjectsView />);
        mocks.workspaceLoading = false;
        mocks.workspaceError = 'Réseau indisponible';
        rerender(<ProjectsView />);
        expect(screen.getByLabelText('Nom')).toHaveValue('Brouillon hors ligne');
        expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Réseau indisponible');
        expect(screen.getByRole('button', { name: 'Créer le projet' })).toBeDisabled();
        fireEvent.submit(form);
        expect(mocks.repo.createProject).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Revérifier l’accès' }));
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
        mocks.workspaceLoading = true;
        rerender(<ProjectsView />);
        expect(screen.getByRole('button', { name: 'Créer le projet' })).toBeDisabled();
        mocks.workspaceLoading = false;
        mocks.workspaceError = null;
        rerender(<ProjectsView />);
        fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));
        await waitFor(() => expect(mocks.repo.createProject).toHaveBeenCalledTimes(1));
    });
    it('gates an already-open archive confirmation during revalidation', async () => {
        deepLink();
        const { rerender } = render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Archiver le projet' }));
        mocks.workspaceLoading = true;
        rerender(<ProjectsView />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
        expect(mocks.repo.updateProject).not.toHaveBeenCalled();
        mocks.workspaceLoading = false;
        rerender(<ProjectsView />);
        expect(screen.getByRole('button', { name: 'Confirmer' })).toBeEnabled();
    });
    it.each(['workspace', 'user', 'session', 'role'])('still clears the draft when revalidation changes the actual %s boundary', async dimension => {
        const { rerender } = render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Nouveau projet' }));
        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Brouillon privé' } });
        mocks.workspaceLoading = true;
        rerender(<ProjectsView />);
        if (dimension === 'workspace') mocks.workspaceId = '55555555-5555-4555-8555-555555555555';
        if (dimension === 'user') mocks.userId = '77777777-7777-4777-8777-777777777777';
        if (dimension === 'session') mocks.accessToken = 'token-b';
        if (dimension === 'role') mocks.role = 'viewer';
        rerender(<ProjectsView />);
        mocks.workspaceLoading = false;
        rerender(<ProjectsView />);
        expect(await screen.findByText('Aucun projet pour le moment.')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('Brouillon privé')).not.toBeInTheDocument();
    });
    it('gates both the view and navigation when disabled', () => {
        vi.stubEnv('VITE_PROJECTS_ENABLED', 'false');
        render(<ProjectsView />);
        render(<Sidebar activeView="orgchart" setActiveView={vi.fn()} loading={false} handleBatchExport={vi.fn()} isExporting={false} sourceInfo={{} as never} poleDirectory={[]} selectedPoleKey={null} setSelectedPoleKey={vi.fn()} batchExportLabel="Exporter" />);
        expect(screen.queryByRole('button', { name: 'Projets' })).not.toBeInTheDocument();
        expect(mocks.repo.getRole).not.toHaveBeenCalled();
        expect(mocks.repo.listProjects).not.toHaveBeenCalled();
    });
    it('shows the Projects navigation when enabled', () => {
        const navigate = vi.fn();
        render(<Sidebar activeView="orgchart" setActiveView={navigate} loading={false} handleBatchExport={vi.fn()} isExporting={false} sourceInfo={{} as never} poleDirectory={[]} selectedPoleKey={null} setSelectedPoleKey={vi.fn()} batchExportLabel="Exporter" />);
        fireEvent.click(screen.getByRole('button', { name: 'Projets' }));
        expect(navigate).toHaveBeenCalledWith('projects');
    });
    it('shows actual loading and empty states', async () => {
        const pending = deferred<Project[]>();
        mocks.repo.listProjects.mockReturnValueOnce(pending.promise);
        render(<ProjectsView />);
        expect(screen.getByRole('status')).toHaveTextContent(/chargement/i);
        expect(screen.queryByText('Aucun projet pour le moment.')).not.toBeInTheDocument();
        await act(async () => pending.resolve([]));
        expect(await screen.findByText('Aucun projet pour le moment.')).toBeInTheDocument();
    });
    it('surfaces a service error with retry and never claims empty data', async () => {
        mocks.repo.listProjects.mockRejectedValueOnce(new Error('Service indisponible'));
        render(<ProjectsView />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Service indisponible');
        expect(screen.queryByText('Aucun projet pour le moment.')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
        expect(await screen.findByText('Aucun projet pour le moment.')).toBeInTheDocument();
    });
    it('requires a connected session', () => {
        mocks.userId = '';
        render(<ProjectsView />);
        expect(screen.getByText(/connectez-vous/i)).toBeInTheDocument();
        expect(mocks.repo.listProjects).not.toHaveBeenCalled();
    });
    it('validates membership before any project deep-link selection', async () => {
        deepLink();
        const pending = deferred<WorkspaceRole>();
        mocks.repo.getRole.mockReturnValueOnce(pending.promise);
        render(<ProjectsView />);
        expect(mocks.repo.getProject).not.toHaveBeenCalled();
        await act(async () => pending.resolve('viewer'));
        expect(await screen.findByRole('heading', { name: project.name })).toBeInTheDocument();
        expect(mocks.repo.getProject).toHaveBeenCalledWith(project.id);
        expect(screen.queryByRole('button', { name: 'Nouveau projet' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Nouvelle tâche' })).not.toBeInTheDocument();
        expect(screen.getByText('Camille du profil')).toBeInTheDocument();
    });
    it('does not select an inaccessible workspace from a URL', () => {
        window.history.replaceState(null, '', `/?v=projects&workspace=66666666-6666-4666-8666-666666666666&project=${project.id}`);
        render(<ProjectsView />);
        expect(screen.getByRole('alert')).toHaveTextContent(/inaccessible/i);
        expect(mocks.setActive).not.toHaveBeenCalled();
        expect(mocks.repo.getProject).not.toHaveBeenCalled();
    });
    it('offers explicit switching to an accessible linked workspace', () => {
        window.history.replaceState(null, '', `/?v=projects&workspace=55555555-5555-4555-8555-555555555555&project=${project.id}`);
        render(<ProjectsView />);
        expect(mocks.setActive).not.toHaveBeenCalled();
        expect(mocks.repo.getProject).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’espace Autre espace' }));
        expect(mocks.setActive).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555');
    });
    it('creates a project once, retains the generated UUID on a failed submission, and preserves typed fields', async () => {
        const pending = deferred<Project>();
        mocks.repo.createProject.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('Confirmation impossible'));
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Nouveau projet' }));
        const dialog = screen.getByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Mon projet' } });
        const form = within(dialog).getByRole('button', { name: 'Créer le projet' }).closest('form')!;
        fireEvent.submit(form);
        fireEvent.submit(form);
        expect(mocks.repo.createProject).toHaveBeenCalledTimes(1);
        await act(async () => pending.resolve(project));
        expect(await screen.findByRole('heading', { name: project.name })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Nouveau projet' }));
        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Autre projet' } });
        fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Confirmation impossible');
        const first = mocks.repo.createProject.mock.calls[1]?.[0];
        expect(screen.getByLabelText('Nom')).toHaveValue('Autre projet');
        fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));
        await waitFor(() => expect(mocks.repo.createProject).toHaveBeenCalledTimes(3));
        expect(mocks.repo.createProject.mock.calls[2]?.[0].id).toBe(first.id);
        expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    });
    it('edits task status, description, current member and calendar date', async () => {
        deepLink();
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: `Modifier la tâche ${task.title}` }));
        expect(screen.getByLabelText('Titre')).toHaveValue(task.title);
        fireEvent.change(screen.getByLabelText('Statut'), { target: { value: 'done' } });
        fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-10-01' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la tâche' }));
        await waitFor(() => expect(mocks.repo.updateTask).toHaveBeenCalledWith(project.id, task.id, 1, expect.objectContaining({ status: 'done', assignee_id: null, due_date: '2026-10-01' })));
        expect(await screen.findByText('Modifications enregistrées.')).toBeInTheDocument();
    });
    it('archives only after confirmation and supports restoration', async () => {
        deepLink();
        mocks.repo.updateProject.mockResolvedValueOnce({ ...project, archived_at: '2026-09-09T12:00:00Z', version: 2 });
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Archiver le projet' }));
        expect(mocks.repo.updateProject).not.toHaveBeenCalled();
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmer' }));
        await waitFor(() => expect(mocks.repo.updateProject).toHaveBeenCalledWith(project.id, 1, { archived_at: expect.any(String) }));
        fireEvent.click(await screen.findByRole('button', { name: 'Restaurer le projet' }));
        expect(mocks.repo.updateProject).toHaveBeenCalledTimes(1);
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmer' }));
        await waitFor(() => expect(mocks.repo.updateProject).toHaveBeenLastCalledWith(project.id, 2, { archived_at: null }));
    });
    it('keeps tasks readable but not mutable under an archived project', async () => {
        deepLink();
        mocks.repo.getProject.mockResolvedValue({ ...project, archived_at: '2026-09-09' });
        render(<ProjectsView />);
        expect(await screen.findByText(task.title)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Nouvelle tâche' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `Modifier la tâche ${task.title}` })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: `Archiver la tâche ${task.title}` })).not.toBeInTheDocument();
    });
    it('creates an empty task form with only real member options and locks duplicate submits', async () => {
        deepLink();
        const pending = deferred<ProjectTask>();
        mocks.repo.createTask.mockReturnValueOnce(pending.promise);
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle tâche' }));
        expect(screen.getByLabelText('Titre')).toHaveValue('');
        expect(screen.getByLabelText('Description')).toHaveValue('');
        expect(screen.getByLabelText('Statut')).toHaveValue('todo');
        expect(screen.getByLabelText('Échéance')).toHaveValue('');
        expect(within(screen.getByLabelText('Responsable')).getAllByRole('option').map(o => o.textContent)).toEqual(['Non attribuée', 'Camille du profil']);
        fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Tâche ajoutée' } });
        fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: mocks.userId } });
        const form = screen.getByRole('button', { name: 'Créer la tâche' }).closest('form')!;
        fireEvent.submit(form); fireEvent.submit(form);
        expect(mocks.repo.createTask).toHaveBeenCalledTimes(1);
        expect(mocks.repo.createTask).toHaveBeenCalledWith(project.id, expect.objectContaining({ title: 'Tâche ajoutée', status: 'todo', assignee_id: mocks.userId, due_date: null }));
        await act(async () => pending.resolve({ ...task, id: 'new-task', title: 'Tâche ajoutée' }));
        expect(await screen.findByText('Tâche ajoutée')).toBeInTheDocument();
    });
    it('preserves a conflicting project draft without showing a false save', async () => {
        deepLink();
        mocks.repo.updateProject.mockRejectedValueOnce(new Error('Objet modifié. Rechargez.'));
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Modifier le projet' }));
        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Brouillon conservé' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le projet' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Objet modifié');
        expect(screen.getByLabelText('Nom')).toHaveValue('Brouillon conservé');
        expect(screen.queryByText('Modifications enregistrées.')).not.toBeInTheDocument();
        expect(mocks.repo.updateProject).toHaveBeenCalledWith(project.id, 1, { name: 'Brouillon conservé', description: project.description });
    });
    it('archives and restores a task only after confirmation', async () => {
        deepLink();
        mocks.repo.updateTask.mockResolvedValueOnce({ ...task, archived_at: '2026-09-09', version: 2 });
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: `Archiver la tâche ${task.title}` }));
        expect(mocks.repo.updateTask).not.toHaveBeenCalled();
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
        expect(mocks.repo.updateTask).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: `Archiver la tâche ${task.title}` }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmer' }));
        await waitFor(() => expect(mocks.repo.updateTask).toHaveBeenCalledWith(project.id, task.id, 1, { archived_at: expect.any(String) }));
        expect(await screen.findByText(/aucune tâche active/i)).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('Afficher les éléments archivés'));
        fireEvent.click(screen.getByRole('button', { name: `Restaurer la tâche ${task.title}` }));
        expect(mocks.repo.updateTask).toHaveBeenCalledTimes(1);
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmer' }));
        await waitFor(() => expect(mocks.repo.updateTask).toHaveBeenLastCalledWith(project.id, task.id, 2, { archived_at: null }));
    });
    it('does not invent a removed assignee or reassign them on edit', async () => {
        deepLink();
        mocks.repo.listMembers.mockResolvedValue([]);
        render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: `Modifier la tâche ${task.title}` }));
        expect(within(screen.getByLabelText('Responsable')).getByRole('option', { name: 'Ancien membre (non assignable)' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la tâche' }));
        await waitFor(() => expect(mocks.repo.updateTask).toHaveBeenCalledTimes(1));
        expect(mocks.repo.updateTask.mock.calls[0]?.[3]).not.toHaveProperty('assignee_id');
    });
    it.each(['workspace', 'user', 'session'])('ignores old loading promises after a %s change', async dimension => {
        const pending = deferred<Project[]>();
        mocks.repo.listProjects.mockReturnValueOnce(pending.promise);
        const { rerender } = render(<ProjectsView />);
        await waitFor(() => expect(mocks.repo.listProjects).toHaveBeenCalledTimes(1));
        if (dimension === 'workspace') mocks.workspaceId = '55555555-5555-4555-8555-555555555555';
        if (dimension === 'user') mocks.userId = '77777777-7777-4777-8777-777777777777';
        if (dimension === 'session') mocks.accessToken = 'token-b';
        rerender(<ProjectsView />);
        expect(await screen.findByText('Aucun projet pour le moment.')).toBeInTheDocument();
        await act(async () => pending.resolve([project]));
        expect(screen.queryByText(project.name)).not.toBeInTheDocument();
    });
    it('ignores an old save response after the workspace changes', async () => {
        const pending = deferred<Project>();
        mocks.repo.createProject.mockReturnValueOnce(pending.promise);
        const { rerender } = render(<ProjectsView />);
        fireEvent.click(await screen.findByRole('button', { name: 'Nouveau projet' }));
        fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Ancien espace' } });
        fireEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));
        mocks.workspaceId = '55555555-5555-4555-8555-555555555555';
        rerender(<ProjectsView />);
        await act(async () => pending.resolve(project));
        expect(await screen.findByText('Aucun projet pour le moment.')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(new URLSearchParams(window.location.search).get('project')).toBeNull();
    });
});
