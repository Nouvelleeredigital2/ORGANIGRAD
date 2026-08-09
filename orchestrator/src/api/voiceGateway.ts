import type { FastifyInstance } from 'fastify';
import { forwardVoiceGateway, type VoiceGatewayAction } from '@apps2026/voice-client/server';

/**
 * Proxy vocal Organigrad — patron LINK (src/lib/voiceGatewayProxy.ts + routes
 * api/voice/gateway/*) adapté à Fastify (chantier 4, SDK @apps2026/voice-client).
 *
 * Deux routes POST relayées vers le NED Voice Gateway :
 *   - /api/voice/gateway/frames        (trames PCM de la dictée)
 *   - /api/voice/gateway/interruption  (barge-in)
 *
 * Le token (`NED_VOICE_GATEWAY_TOKEN`) reste STRICTEMENT côté serveur : la SPA
 * n'appelle que ces routes via `createVoiceGatewayClient({ proxyBasePath })`.
 * Sans configuration → 503 ; gateway injoignable → 502. Best-effort : ce proxy
 * ne porte aucune donnée métier, seulement de l'audio de session.
 */

export interface VoiceGatewayRouteOptions {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
}

export function registerVoiceGatewayRoutes(
    app: FastifyInstance,
    { env = process.env, fetcher = fetch }: VoiceGatewayRouteOptions = {},
): void {
    const relay = async (action: VoiceGatewayAction, payload: unknown) => {
        const response = await forwardVoiceGateway(action, payload, env, fetcher);
        return { status: response.status, body: await response.text() };
    };

    app.post('/api/voice/gateway/frames', async (req, reply) => {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return reply.code(400).send({ error: 'trame audio invalide' });
        }
        const out = await relay('frames', body);
        return reply.code(out.status).header('Cache-Control', 'no-store').send(out.body);
    });

    app.post('/api/voice/gateway/interruption', async (req, reply) => {
        const out = await relay('interruption', req.body ?? {});
        return reply.code(out.status).header('Cache-Control', 'no-store').send(out.body);
    });
}
