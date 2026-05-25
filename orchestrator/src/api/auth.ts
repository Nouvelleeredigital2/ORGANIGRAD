import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';

/**
 * Authentification par clé d'API workspace.
 *
 * Header attendu : `Authorization: Bearer ok_<32hex>`
 * Vérification : SHA-256 du token == `key_hash` d'une ligne non-révoquée.
 * En cas de succès, on peuple `request.workspaceId` + `request.apiKeyId`
 * et on met à jour `last_used_at`.
 */

declare module 'fastify' {
    interface FastifyRequest {
        workspaceId?: string;
        apiKeyId?: string;
    }
}

export interface AuthDeps {
    sql: Sql;
}

export function buildAuthHook(deps: AuthDeps) {
    return async function authHook(req: FastifyRequest, reply: FastifyReply) {
        // Header standard
        const header = req.headers.authorization ?? '';
        const m = header.match(/^Bearer\s+(.+)$/i);
        // Fallback query string — uniquement utilisé par SSE (EventSource ne porte
        // pas de headers personnalisés).
        const queryKey =
            typeof (req.query as Record<string, unknown>)?.key === 'string'
                ? ((req.query as Record<string, string>).key as string)
                : null;

        const rawKey = (m?.[1] ?? queryKey ?? '').trim();
        if (!rawKey) {
            return reply.code(401).send({ error: 'MISSING_BEARER_TOKEN' });
        }
        const hash = createHash('sha256').update(rawKey).digest('hex');

        const rows = await deps.sql<{ id: string; workspace_id: string }[]>`
            update public.workspace_api_keys
               set last_used_at = now()
             where key_hash = ${hash} and revoked_at is null
            returning id, workspace_id
        `;
        const row = rows[0];
        if (!row) {
            return reply.code(401).send({ error: 'INVALID_OR_REVOKED_KEY' });
        }
        req.workspaceId = row.workspace_id;
        req.apiKeyId = row.id;
    };
}
