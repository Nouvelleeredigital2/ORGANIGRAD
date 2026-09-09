import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { createProjectRepo } from './projectRepo';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const project = { id: projectId, workspace_id: workspaceId, name: 'Projet réel', description: '', archived_at: null, created_at: '2026-09-09', updated_at: '2026-09-09', version: 1 };
const requests: { url: URL; method: string; body: Record<string, unknown> | null; headers: Headers; signal?: AbortSignal | null }[] = [];
let replies: { data: unknown; status?: number; lost?: boolean }[];
let current = true;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: new URL(String(input)), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init?.headers), signal: init?.signal });
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected request');
    if (reply.lost) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(reply.data), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } });
});
const client = createClient<Database>('https://projects.invalid', 'test-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetchMock } });
const session = { user: { id: userId }, access_token: 'test-token' };
const sessionMock = vi.spyOn(client.auth, 'getSession');
const repo = () => createProjectRepo({ workspaceId, userId, accessToken: 'test-token', isCurrent: () => current }, client);

beforeEach(() => {
    requests.length = 0;
    replies = [];
    current = true;
    sessionMock.mockResolvedValue({ data: { session }, error: null } as never);
});

describe('projectRepo — scoped Supabase CRUD, no browser persistence', () => {
    it('lists real projects including archives within the current workspace', async () => {
        replies.push({ data: [project] });
        expect(await repo().listProjects()).toEqual([project]);
        expect(requests[0]?.url.pathname).toBe('/rest/v1/projects');
        expect(requests[0]?.url.searchParams.get('workspace_id')).toBe(`eq.${workspaceId}`);
    });
    it('creates with an explicit UUID and leaves server defaults/timestamps to SQL', async () => {
        replies.push({ data: project });
        expect(await repo().createProject({ id: projectId, name: ' Projet réel ' })).toEqual(project);
        expect(requests[0]?.body).toEqual({ id: projectId, workspace_id: workspaceId, name: 'Projet réel', description: '' });
    });
    it('recovers a lost create response by exact ID within the same workspace, without reinserting', async () => {
        replies.push({ lost: true, data: null }, { data: project });
        expect(await repo().createProject({ id: projectId, name: 'Projet réel' })).toEqual(project);
        expect(requests.map(r => r.method)).toEqual(['POST', 'GET']);
        expect(requests[1]?.url.searchParams.get('id')).toBe(`eq.${projectId}`);
        expect(requests[1]?.url.searchParams.get('workspace_id')).toBe(`eq.${workspaceId}`);
    });
    it('reports an uncertain create if reread is unavailable; the caller keeps the UUID for retry', async () => {
        replies.push({ lost: true, data: null }, { lost: true, data: null });
        await expect(repo().createProject({ id: projectId, name: 'Projet réel' })).rejects.toThrow(/confirmation.*réessayer/i);
        expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
    });
    it('updates only mutable columns and filters the previous version', async () => {
        replies.push({ data: { ...project, name: 'Nouveau', version: 2 } });
        await repo().updateProject(projectId, 1, { name: 'Nouveau', workspace_id: 'foreign', id: taskId, version: 90 } as never);
        expect(requests[0]?.body).toEqual({ name: 'Nouveau', version: 2 });
        expect(requests[0]?.url.searchParams.get('version')).toBe('eq.1');
        expect(requests[0]?.url.searchParams.get('id')).toBe(`eq.${projectId}`);
        expect(requests[0]?.url.searchParams.get('workspace_id')).toBe(`eq.${workspaceId}`);
    });
    it('treats a zero-row update as conflict or access revoked, never as success', async () => {
        replies.push({ data: null });
        await expect(repo().updateProject(projectId, 1, { name: 'Nouveau' })).rejects.toThrow(/modifié|droits/i);
    });
    it('scopes task updates by workspace, project, id and version', async () => {
        replies.push({ data: { id: taskId, status: 'done', version: 2 } });
        await repo().updateTask(projectId, taskId, 1, { status: 'done', project_id: taskId, updated_at: 'invented' } as never);
        expect(requests[0]?.body).toEqual({ status: 'done', version: 2 });
        expect(requests[0]?.url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
        expect(requests[0]?.url.searchParams.get('workspace_id')).toBe(`eq.${workspaceId}`);
        expect(requests[0]?.url.searchParams.get('id')).toBe(`eq.${taskId}`);
        expect(requests[0]?.url.searchParams.get('version')).toBe('eq.1');
    });
    it('creates tasks with nullable assignment/date and recovers within the exact project', async () => {
        replies.push({ data: { message: 'duplicate', code: '23505' }, status: 409 }, { data: { id: taskId, workspace_id: workspaceId, project_id: projectId, title: 'Tâche', description: '', status: 'todo', assignee_id: null, due_date: null } });
        await repo().createTask(projectId, { id: taskId, title: 'Tâche' });
        expect(requests[0]?.body).toEqual({ id: taskId, workspace_id: workspaceId, project_id: projectId, title: 'Tâche', description: '', status: 'todo', assignee_id: null, due_date: null });
        expect(requests[1]?.url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
    });
    it('validates lengths, statuses and calendar dates before contacting Supabase', async () => {
        await expect(repo().createProject({ id: projectId, name: ' ' })).rejects.toThrow();
        await expect(repo().createProject({ id: projectId, name: 'x'.repeat(161) })).rejects.toThrow();
        await expect(repo().createTask(projectId, { id: taskId, title: 'T', due_date: '2026-02-30' })).rejects.toThrow(/date/i);
        await expect(repo().updateTask(projectId, taskId, 1, { status: 'invalid' } as never)).rejects.toThrow(/statut/i);
        expect(requests).toHaveLength(0);
    });
    it('checks membership with the authenticated user ID', async () => {
        replies.push({ data: { role: 'viewer' } });
        expect(await repo().getRole()).toBe('viewer');
        expect(requests[0]?.url.searchParams.get('user_id')).toBe(`eq.${userId}`);
    });
    it('loads only actual current members and their name labels', async () => {
        replies.push({ data: [{ user_id: userId }] }, { data: [{ id: userId, display_name: 'Nom du profil' }] });
        expect(await repo().listMembers()).toEqual([{ id: userId, label: 'Nom du profil' }]);
        expect(requests[0]?.url.pathname).toBe('/rest/v1/workspace_members');
        expect(requests[1]?.url.searchParams.get('select')).toBe('id,display_name');
    });
    it('requires the same session and a current view before issuing requests', async () => {
        current = false;
        await expect(repo().listProjects()).rejects.toThrow(/session|espace/i);
        current = true;
        sessionMock.mockResolvedValue({ data: { session: null }, error: null });
        await expect(repo().listProjects()).rejects.toThrow(/session/i);
        expect(requests).toHaveLength(0);
    });
    it('does not recover into a replacement session after an ambiguous insert', async () => {
        fetchMock.mockImplementationOnce(async () => { current = false; throw new TypeError('Lost'); });
        await expect(repo().createProject({ id: projectId, name: 'Projet' })).rejects.toThrow(/session|espace/i);
        expect(requests).toHaveLength(0);
    });
    it('surfaces unavailable tables instead of returning a fake empty list', async () => {
        replies.push({ data: { message: 'Missing relation', code: '42P01' }, status: 404 });
        await expect(repo().listProjects()).rejects.toThrow(/indisponible/i);
    });
    it('pins the captured Authorization and attaches an abort signal to every request', async () => {
        replies.push({ data: project });
        await repo().updateProject(projectId, 1, { name: 'Nouveau' });
        expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-token');
        expect(requests[0]?.signal).toBeDefined();
    });
    it('cannot send an old mutation as the new user if auth changes between checking and fetch', async () => {
        sessionMock.mockResolvedValueOnce({ data: { session }, error: null } as never)
            .mockResolvedValueOnce({ data: { session: { ...session, user: { id: 'other-user' }, access_token: 'other-token' } }, error: null } as never);
        replies.push({ data: project });
        await repo().updateProject(projectId, 1, { name: 'Nouveau' });
        expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-token');
    });
    it('cancels a request when its workspace boundary unmounts', async () => {
        const controller = new AbortController();
        let started!: () => void;
        const sent = new Promise<void>(resolve => { started = resolve; });
        let signal: AbortSignal | null | undefined;
        fetchMock.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
            signal = init?.signal;
            signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            started();
        }));
        const pending = createProjectRepo({ workspaceId, userId, accessToken: 'test-token', isCurrent: () => current, signal: controller.signal }, client).listProjects();
        const assertion = expect(pending).rejects.toThrow(/session|espace/i);
        await sent;
        controller.abort();
        await assertion;
        expect(signal?.aborted).toBe(true);
    });
    it('aborts a hung request at its deadline', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        try {
            const pending = repo().listProjects();
            const assertion = expect(pending).rejects.toThrow(/délai|indisponible/i);
            await vi.advanceTimersByTimeAsync(15_001);
            await assertion;
        } finally { vi.useRealTimers(); }
    });
    it('rejects UUID recovery when the saved project has different submitted content', async () => {
        replies.push({ data: { message: 'duplicate', code: '23505' }, status: 409 }, { data: project });
        await expect(repo().createProject({ id: projectId, name: 'A different draft' })).rejects.toThrow(/conflit|différent/i);
        expect(requests.filter(r => r.method === 'POST')).toHaveLength(1);
    });
    it('rejects UUID recovery when a saved task has different submitted content', async () => {
        replies.push({ lost: true, data: null }, { data: { id: taskId, title: 'Other task' } });
        await expect(repo().createTask(projectId, { id: taskId, title: 'Tâche' })).rejects.toThrow(/conflit|différent/i);
    });
    it('paginates projects with stable ordering instead of silently stopping at a server page', async () => {
        replies.push({ data: Array.from({ length: 100 }, (_, i) => ({ ...project, id: String(i) })) }, { data: [{ ...project, id: 'last' }] });
        const rows = await repo().listProjects();
        expect(rows).toHaveLength(101);
        expect(requests[0]?.url.searchParams.get('limit')).toBe('100');
        expect(requests[1]?.url.searchParams.get('offset')).toBe('100');
        expect(requests[0]?.url.searchParams.get('order')).toContain('id');
    });
    it('paginates tasks within the same project', async () => {
        replies.push({ data: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) }, { data: [] });
        expect(await repo().listTasks(projectId)).toHaveLength(100);
        expect(requests).toHaveLength(2);
        expect(requests[1]?.url.searchParams.get('project_id')).toBe(`eq.${projectId}`);
    });
    it('paginates membership before bounded profile reads', async () => {
        const members = Array.from({ length: 100 }, (_, i) => ({ user_id: `member-${i}` }));
        replies.push({ data: members }, { data: [{ user_id: userId }] }, { data: members.map(m => ({ id: m.user_id, display_name: m.user_id })) }, { data: [{ id: userId, display_name: 'Last member' }] });
        const rows = await repo().listMembers();
        expect(rows).toHaveLength(101);
        expect(rows[100]?.label).toBe('Last member');
        expect(requests).toHaveLength(4);
    });
    it('reports a bounded collection limit rather than claiming a partial list is complete', async () => {
        for (let i = 0; i < 20; i++) replies.push({ data: Array(100).fill(project) });
        await expect(repo().listProjects()).rejects.toThrow(/limite|volumineux/i);
        expect(requests).toHaveLength(20);
    });
});
