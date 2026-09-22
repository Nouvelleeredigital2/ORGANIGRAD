import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerVoiceGatewayRoutes } from '../src/api/voiceGateway.js';

/**
 * Proxy vocal Organigrad (chantier 4) — patron LINK adapté à Fastify.
 * Le token gateway reste côté serveur : le front n'appelle que ces routes.
 */

let app: FastifyInstance | null = null;
afterEach(async () => {
    await app?.close();
    app = null;
});

function makeApp(env: Record<string, string | undefined>, fetcher?: typeof fetch) {
    app = Fastify({ logger: false });
    registerVoiceGatewayRoutes(app, { env, fetcher });
    return app;
}

describe('voice gateway proxy', () => {
    it('répond 503 quand le gateway est non configuré (jamais de valeur de secret)', async () => {
        const server = makeApp({});
        const res = await server.inject({ method: 'POST', url: '/api/voice/gateway/frames', payload: { pcm: [] } });
        expect(res.statusCode).toBe(503);
        expect(res.body).not.toContain('NED_VOICE_GATEWAY_TOKEN');
    });

    it('relaie les trames au gateway configuré avec le Bearer serveur', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
        const server = makeApp(
            { NED_VOICE_GATEWAY_URL: 'http://gw:8000', NED_VOICE_GATEWAY_TOKEN: 'tok' },
            fetcher,
        );
        const res = await server.inject({
            method: 'POST',
            url: '/api/voice/gateway/frames',
            payload: { pcm: [0.1], sampleRate: 16000 },
        });
        expect(res.statusCode).toBe(200);
        expect(fetcher).toHaveBeenCalledWith('http://gw:8000/v1/voice/frames', expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        }));
    });

    it('rejette une trame non-objet en 400 sans appeler le gateway', async () => {
        const fetcher = vi.fn();
        const server = makeApp(
            { NED_VOICE_GATEWAY_URL: 'http://gw:8000', NED_VOICE_GATEWAY_TOKEN: 'tok' },
            fetcher,
        );
        const res = await server.inject({
            method: 'POST',
            url: '/api/voice/gateway/frames',
            headers: { 'content-type': 'application/json' },
            payload: '"pas-un-objet"',
        });
        expect(res.statusCode).toBe(400);
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("relaie l'interruption et renvoie 502 si le gateway est injoignable", async () => {
        const server = makeApp(
            { NED_VOICE_GATEWAY_URL: 'http://gw:8000', NED_VOICE_GATEWAY_TOKEN: 'tok' },
            vi.fn().mockRejectedValue(new Error('down')),
        );
        const res = await server.inject({ method: 'POST', url: '/api/voice/gateway/interruption', payload: {} });
        expect(res.statusCode).toBe(502);
    });
});
