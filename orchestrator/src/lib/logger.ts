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
