import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const accessToken = 'human.session.signature';
const token = `ogp_${'a'.repeat(64)}`;
const expiresAt = Math.floor(Date.now() / 1000) + 600;
const issued = { id, token, workspace: workspaceId, projectId, scopes: ['projects:read'], expiresAt };
const row = { id, name: 'Synapse personnel', prefix: token.slice(0, 12), expiresAt, createdAt: '2026-09-09T10:00:00Z', revokedAt: null };
const fetcher = vi.fn<typeof fetch>();
async function client(overrides = {}) {
    // Dynamic discovery gives an assertion RED before the new module exists.
    const modules = import.meta.glob('./privateProjectTokens.ts');
    expect(modules['./privateProjectTokens.ts'], 'the private token client must exist').toBeTypeOf('function');
    const module = await modules['./privateProjectTokens.ts']!() as typeof import('./privateProjectTokens');
    return module.createPrivateProjectTokens({ accessToken, workspaceId, projectId, isCurrent: () => true, ...overrides });
}
beforeEach(() => {
    vi.stubEnv('VITE_ORCHESTRATOR_URL', 'https://orchestrator.example.test');
    vi.stubGlobal('fetch', fetcher);
    fetcher.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('private project token HTTP client', () => {
    it('issues once to the configured API with human headers, seconds and secure fetch options', async () => {
        fetcher.mockResolvedValue(new Response(JSON.stringify(issued), { status: 201 }));
        const api = await client();
        expect(await api.create('Synapse personnel', expiresAt)).toEqual(issued);
        expect(fetcher).toHaveBeenCalledExactlyOnceWith('https://orchestrator.example.test/api/private-projects/tokens', expect.objectContaining({
            method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
            headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}`, 'X-Workspace-Id': workspaceId }),
            body: JSON.stringify({ projectId, name: 'Synapse personnel', expiresAt }), signal: expect.any(AbortSignal),
        }));
    });
    it('lists by project and UUID cursor, then revokes without a body', async () => {
        vi.stubEnv('VITE_ORCHESTRATOR_URL', 'https://orchestrator.example.test/api/');
        fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ tokens: [row], nextCursor: id })))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const api = await client();
        expect(await api.list(projectId)).toEqual({ tokens: [row], nextCursor: id });
        expect(fetcher.mock.calls[0]![0]).toBe(`https://orchestrator.example.test/api/private-projects/tokens?projectId=${projectId}&cursor=${projectId}`);
        await api.revoke(id);
        expect(fetcher.mock.calls[1]).toEqual([`https://orchestrator.example.test/api/private-projects/tokens/${id}`, expect.objectContaining({ method: 'DELETE' })]);
        expect(fetcher.mock.calls[1]![1]).not.toHaveProperty('body');
        for (const [, init] of fetcher.mock.calls) {
            expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
            expect(new Headers(init?.headers).has('Origin')).toBe(false);
        }
    });
    it.each(['', 'http://remote.test', 'https://u:p@host.test', 'https://host.test?token=x', 'https://host.test/#fragment', 'https://host.test/other', '//remote.test'])('refuses unsafe or missing configured base %s', async base => {
        vi.stubEnv('VITE_ORCHESTRATOR_URL', base);
        await expect((await client()).list()).rejects.toThrow('Accès Synapse indisponible');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it.each([token, 'ok_admin', ''])('never accepts a personal or technical token as human auth', async value => {
        await expect((await client({ accessToken: value })).list()).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('rejects invalid selectors and expiry before sending anything', async () => {
        const api = await client();
        await expect(api.list('secret-in-url')).rejects.toThrow();
        await expect(api.revoke('../introspect')).rejects.toThrow();
        await expect(api.create(' ', expiresAt)).rejects.toThrow();
        await expect(api.create('valid', Date.now())).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it.each([302, 401, 403, 404, 429, 500])('sanitizes HTTP %s without reading or exposing the error body', async status => {
        const response = new Response(JSON.stringify({ error: `${token} ${accessToken}` }), { status });
        const read = vi.spyOn(response, 'json');
        fetcher.mockResolvedValue(response);
        await expect((await client()).list()).rejects.toThrow(/^Accès Synapse indisponible\./);
        expect(read).not.toHaveBeenCalled();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each([{ projectId: workspaceId }, { workspace: projectId }, { scopes: ['projects:write'] }, { token: 'ok_key' }, { expiresAt: expiresAt + 100 }])('refuses inconsistent issuance %j', async change => {
        fetcher.mockResolvedValue(new Response(JSON.stringify({ ...issued, ...change }), { status: 201 }));
        await expect((await client()).create('Synapse', expiresAt)).rejects.toThrow();
    });
    it('projects list metadata without retaining unexpected secrets', async () => {
        fetcher.mockResolvedValue(new Response(JSON.stringify({ tokens: [{ ...row, token, jwt: accessToken }] })));
        expect(await (await client()).list()).toEqual({ tokens: [row] });
    });
    it('ignores stale response bodies and refuses subsequent requests', async () => {
        let current = true;
        const api = await client({ isCurrent: () => current });
        const response = new Response(JSON.stringify(issued), { status: 201 });
        const read = vi.spyOn(response, 'json');
        fetcher.mockImplementation(async () => { current = false; return response; });
        await expect(api.create('Synapse', expiresAt)).rejects.toThrow();
        expect(read).not.toHaveBeenCalled();
        await expect(api.list()).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('bounds a hung response body and aborts without retrying', async () => {
        const api = await client();
        vi.useFakeTimers();
        fetcher.mockResolvedValue({ status: 200, redirected: false, json: () => new Promise(() => {}) } as Response);
        const pending = expect(api.list()).rejects.toThrow('Accès Synapse indisponible');
        await vi.advanceTimersByTimeAsync(10_000);
        await pending;
        expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('rejects a redirected success response', async () => {
        const response = new Response(JSON.stringify({ tokens: [] }));
        Object.defineProperty(response, 'redirected', { value: true });
        fetcher.mockResolvedValue(response);
        await expect((await client()).list()).rejects.toThrow('Accès Synapse indisponible');
    });
    it('discards JSON that resolves after the boundary changed', async () => {
        let current = true;
        let resolve!: (value: unknown) => void;
        const json = vi.fn(() => new Promise(r => { resolve = r; }));
        fetcher.mockResolvedValue({ status: 201, redirected: false, json } as unknown as Response);
        const api = await client({ isCurrent: () => current });
        const pending = expect(api.create('Synapse', expiresAt)).rejects.toThrow('Accès Synapse indisponible');
        await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
        current = false;
        resolve(issued);
        await pending;
    });
    it('aborts an in-flight request on unmount and never sends when already aborted', async () => {
        const controller = new AbortController();
        fetcher.mockImplementation(() => new Promise(() => {}));
        const api = await client({ signal: controller.signal });
        const pending = expect(api.list()).rejects.toThrow('Accès Synapse indisponible');
        controller.abort();
        await pending;
        await expect(api.list()).rejects.toThrow();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    });
    it('blocks duplicate POSTs even when called outside React', async () => {
        fetcher.mockResolvedValue(new Response(JSON.stringify(issued), { status: 201 }));
        const api = await client();
        const first = api.create('Synapse', expiresAt);
        await expect(api.create('Synapse', expiresAt)).rejects.toThrow();
        await expect(first).resolves.toEqual(issued);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each([{ tokens: 'invalid' }, { tokens: [{ ...row, prefix: token }] }, { tokens: [row, row] }, { tokens: [], nextCursor: 'not-a-uuid' }])('refuses malformed or secret-bearing list metadata', async data => {
        fetcher.mockResolvedValue(new Response(JSON.stringify(data)));
        await expect((await client()).list()).rejects.toThrow();
    });
});
