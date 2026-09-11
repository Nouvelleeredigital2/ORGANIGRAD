import { describe, expect, it, vi } from 'vitest';
import { createEngineTaskClient } from '../src/integrations/engineTaskClient.js';

const origin = 'https://engine.example.org';
const jobId = '00000000-0000-4000-8000-000000000001';
const fileId = '00000000-0000-4000-8000-000000000002';
const key = 'server-secret';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const engines = { engines: [{ id: 'flux', status: 'available', tasks: ['generate-image'], enabled: true }] };
const created = { jobId, status: 'queued', pipeline: ['flux'] };
const input = { engineId: 'flux', prompt: 'An illustration of a garden' };
const client = (fetchImpl: typeof fetch) => createEngineTaskClient({ baseUrl: origin, qualifiedOrigin: origin, apiKey: key, fetchImpl });

describe('isolated Engine task adapter', () => {
    it('requires an explicitly qualified HTTPS origin and server credential', () => {
        for (const baseUrl of ['http://engine.example.org', 'https://u:p@engine.example.org', origin + '/api', origin + '?key=x']) {
            expect(() => createEngineTaskClient({ baseUrl, qualifiedOrigin: origin, apiKey: key })).toThrow();
        }
        expect(() => createEngineTaskClient({ baseUrl: origin, qualifiedOrigin: 'https://other.example.org', apiKey: key })).toThrow();
        expect(() => createEngineTaskClient({ baseUrl: origin, qualifiedOrigin: origin, apiKey: '' })).toThrow();
    });

    it('submits once with explicit engine, checks availability and disables redirects', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(engines)).mockResolvedValueOnce(json(created, 202));
        const api = client(fetcher);
        expect(await api.submitOnce('attempt-1', input)).toEqual(created);
        expect(await api.submitOnce('attempt-1', input)).toEqual(created);
        expect(fetcher).toHaveBeenCalledTimes(2);
        const [url, options] = fetcher.mock.calls[1]!;
        expect(url).toBe(origin + '/api/v1/jobs');
        expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer ' + key } });
        expect(JSON.parse(String(options?.body))).toEqual({ taskType: 'generate-image', engine: 'flux', prompt: input.prompt });
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        await expect(api.submitOnce('attempt-1', { ...input, prompt: 'Different' })).rejects.toMatchObject({ code: 'ATTEMPT_CONFLICT' });
    });

    it.each(['unavailable', 'disabled', 'loading'])('does not submit to a %s engine or select another', async status => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ engines: [{ ...engines.engines[0], status }] }));
        await expect(client(fetcher).submitOnce('a', input)).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each(['network', 'timeout', 'server', 'malformed'])('marks %s after POST as uncertain and never resubmits', async kind => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(engines));
        if (kind === 'network' || kind === 'timeout') fetcher.mockRejectedValueOnce(new Error(key));
        else fetcher.mockResolvedValueOnce(kind === 'server' ? json({ error: key }, 500) : json({ jobId: key }, 202));
        const api = client(fetcher);
        for (let i = 0; i < 2; i++) {
            await expect(api.submitOnce('a', input)).rejects.toMatchObject({ code: 'DELIVERY_UNCERTAIN', retryable: false });
        }
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('returns validated job state and only same-origin artifact references', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ jobId, status: 'completed', errorMessage: key }))
            .mockResolvedValueOnce(json({ jobId, status: 'completed', results: [{ fileId, role: 'output', type: 'image/png', downloadUrl: `/api/v1/files/${fileId}` }] }));
        const api = client(fetcher);
        expect(await api.getJob(jobId)).toEqual({ jobId, status: 'completed' });
        expect(await api.getResults(jobId)).toEqual({ jobId, status: 'completed', results: [{ fileId, role: 'output', type: 'image/png', downloadUrl: `${origin}/api/v1/files/${fileId}` }] });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('aborts a pending POST at the configured deadline and keeps concurrent calls deduplicated', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(engines)).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error(key)), { once: true });
        }));
        const api = createEngineTaskClient({ baseUrl: origin, qualifiedOrigin: origin, apiKey: key, timeoutMs: 5, fetchImpl: fetcher });
        const results = await Promise.allSettled([api.submitOnce('same', input), api.submitOnce('same', input)]);
        expect(results).toEqual([
            expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ code: 'DELIVERY_UNCERTAIN' }) }),
            expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ code: 'DELIVERY_UNCERTAIN' }) }),
        ]);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('rejects oversized responses and malformed catalog state', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ engines: [{ id: 'flux', status: 'unknown' }] }))
            .mockResolvedValueOnce(json({ engines: [], padding: 'x'.repeat(512_000) }));
        const api = client(fetcher);
        await expect(api.listEngines()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
        await expect(api.listEngines()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it.each(['https://evil.example.org/file', '//evil.example.org/file', '/api/v1/files/../jobs', '/api/v1/files/%2e%2e/jobs'])('rejects unsafe download reference %s', async downloadUrl => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ jobId, status: 'completed', results: [{ fileId, role: 'output', type: 'image/png', downloadUrl }] }));
        await expect(client(fetcher).getResults(jobId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('rejects foreign job IDs, invalid input, and never echoes upstream secrets', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: key }, 401));
        const api = client(fetcher);
        await expect(api.getJob('../escape')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        expect(fetcher).not.toHaveBeenCalled();
        try { await api.getJob(jobId); } catch (error) { expect(String(error)).not.toContain(key); }
        fetcher.mockResolvedValueOnce(json({ jobId: fileId, status: 'completed' }));
        await expect(api.getJob(jobId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
});
