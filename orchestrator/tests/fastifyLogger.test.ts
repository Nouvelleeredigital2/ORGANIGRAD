import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { registerCircuitWorker } from '../src/api/circuitWorker.js';
import { fastifyLoggerOptions, logRouteError } from '../src/lib/logger.js';

// Audit du 22/10/2026 (Lot 0, tâche 0.7) : les serveurs étaient créés avec `logger: false`.

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { lines, stream };
}

afterEach(() => vi.useRealTimers());

it('une erreur du worker de circuit est journalisée, sans le message de l\'exception', async () => {
  vi.useFakeTimers();
  const { lines, stream } = capture();
  const app = Fastify({ logger: fastifyLoggerOptions({ LOG_LEVEL: 'info' }, stream), disableRequestLogging: true });
  const tick = vi.fn().mockRejectedValueOnce(new Error('sensitive connection string')).mockResolvedValue([]);
  registerCircuitWorker(app, { tick }, 1000);
  await app.ready();
  await vi.advanceTimersByTimeAsync(10);
  const journal = lines.join('');
  expect(journal).toContain('Circuit scheduler tick failed');
  expect(journal).toContain('"service":"organigrad"');
  expect(journal).not.toContain('sensitive');
  await app.close();
});

it('une erreur de route est journalisée sans en-tête d\'authentification ni chaîne de requête', async () => {
  const { lines, stream } = capture();
  const app = Fastify({ logger: fastifyLoggerOptions({ LOG_LEVEL: 'info' }, stream), disableRequestLogging: true });
  app.addHook('onError', logRouteError);
  app.get('/api/events', async () => {
    throw new Error('panne avec secret-interne');
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/events?ticket=secret-ticket',
    headers: { authorization: 'Bearer secret-jeton' },
  });
  expect(res.statusCode).toBe(500);
  const journal = lines.join('');
  expect(journal).toContain('/api/events');
  expect(journal).not.toContain('secret-ticket');
  expect(journal).not.toContain('secret-jeton');
  expect(journal).not.toContain('secret-interne');
  expect(journal).toContain('Route failed');
  await app.close();
});

it('niveau : LOG_LEVEL respecté, silencieux par défaut sous les tests, info sinon', () => {
  expect(fastifyLoggerOptions({ LOG_LEVEL: 'warn' }).level).toBe('warn');
  expect(fastifyLoggerOptions({ NODE_ENV: 'test' }).level).toBe('silent');
  expect(fastifyLoggerOptions({ NODE_ENV: 'production' }).level).toBe('info');
  expect(fastifyLoggerOptions({ LOG_LEVEL: 'inconnu', NODE_ENV: 'production' }).level).toBe('info');
});
