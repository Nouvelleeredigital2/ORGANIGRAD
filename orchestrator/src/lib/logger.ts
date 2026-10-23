/**
 * Logger minimaliste APPS-2026 — Organigrad.
 * Écrit sur STDERR (STDOUT réservé aux réponses HTTP/MCP).
 * Champs : { level, ts, service, correlationId?, causationId?, msg, ...extra }
 */
export type LogLevel = 'info' | 'warn' | 'error';

export function log(
  level: LogLevel,
  msg: string,
  ctx: Record<string, unknown> = {},
): void {
  process.stderr.write(
    JSON.stringify({ level, ts: new Date().toISOString(), service: 'organigrad', msg, ...ctx }) +
      '\n',
  );
}

const FASTIFY_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/**
 * Journal Fastify (audit du 22/10/2026, Lot 0, tâche 0.7). Les serveurs étaient créés avec
 * `logger: false` : chaque `app.log` / `req.log` du code (échec du worker de circuit, des
 * livraisons, du consommateur Synapse) était muet. Même convention que `log()` : stderr,
 * `service: 'organigrad'`. Niveau `LOG_LEVEL` (défaut `info`, `silent` sous les tests).
 * Les requêtes ne sont journalisées que par leur méthode et leur chemin : ni en-tête
 * d'authentification, ni chaîne de requête (le flux SSE y porte son ticket).
 */
export function fastifyLoggerOptions(
  env: Record<string, string | undefined> = process.env,
  stream: NodeJS.WritableStream = process.stderr,
) {
  const requested = env.LOG_LEVEL as (typeof FASTIFY_LEVELS)[number] | undefined;
  const level = requested && FASTIFY_LEVELS.includes(requested)
    ? requested
    : env.NODE_ENV === 'test' ? 'silent' : 'info';
  return {
    level,
    stream,
    base: { service: 'organigrad' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'req.headers["x-worker-token"]',
      ],
      censor: '[masqué]',
    },
    serializers: {
      req: (req: { method?: string; url?: string }) => ({
        method: req.method,
        url: String(req.url ?? '').split('?')[0],
      }),
    },
  };
}

/**
 * Crochet `onError` : avec `disableRequestLogging`, Fastify ne journalise plus les erreurs de
 * route. On les note ici, par type et statut seulement — le message d'une exception peut
 * porter une chaîne de connexion ou une donnée métier.
 */
export async function logRouteError(
  req: { log: { error: (o: object, m: string) => void; warn: (o: object, m: string) => void } },
  _reply: unknown,
  error: Error & { statusCode?: number },
): Promise<void> {
  const statusCode = error.statusCode ?? 500;
  const details = { req, statusCode, errorType: error.name };
  if (statusCode >= 500) req.log.error(details, 'Route failed');
  else req.log.warn(details, 'Route rejected');
}
