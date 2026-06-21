import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import { verifySupabaseJwt } from './userAuth.js';
import { scopesForRole } from './scopes.js';

/**
 * Authentification par clé d'API workspace.
 *
 * Header attendu : `Authorization: Bearer ok_<hex>`
 * Vérification : SHA-256 du token == `key_hash` d'une ligne non-révoquée et non
 * expirée. En cas de succès, on peuple `request.workspaceId`, `request.apiKeyId`
 * et `request.scopes`, puis on met à jour `last_used_at`.
 *
 * SÉCURITÉ :
 *   - Aucune clé n'est plus acceptée via query string (`?key=`). Les query
 *     strings fuient dans les logs, proxies et historiques. Le flux SSE
 *     s'authentifie désormais via un ticket court à usage unique (cf. /api/events).
 *   - Les scopes sont chargés et exposés pour l'enforcement par route.
 */

declare module 'fastify' {
    interface FastifyRequest {
        workspaceId?: string;
        apiKeyId?: string;
        scopes?: string[];
        /** Présent si la requête est authentifiée par une session utilisateur (JWT). */
        userId?: string;
    }
}

export interface AuthDeps {
    sql: Sql;
    /**
     * Secret JWT Supabase (HS256). Si fourni, les requêtes avec un Bearer JWT
     * utilisateur (≠ clé `ok_…`) sont authentifiées comme session humaine.
     */
    jwtSecret?: string;
}

interface ApiKeyRow {
    id: string;
    workspace_id: string;
    scopes: string[] | null;
    expires_at: string | null;
}

export function buildAuthHook(deps: AuthDeps) {
    return async function authHook(req: FastifyRequest, reply: FastifyReply) {
        const header = req.headers.authorization ?? '';
        const m = header.match(/^Bearer\s+(.+)$/i);
        const rawKey = (m?.[1] ?? '').trim();
        if (!rawKey) {
            return reply.code(401).send({ error: 'MISSING_BEARER_TOKEN' });
        }

        // ── Session utilisateur (JWT) : tout Bearer qui n'est PAS une clé `ok_…` ──
        // Validation humaine : la session est vérifiée (signature + expiration) et
        // le rôle dans le workspace détermine les scopes (un humain PEUT approuver).
        if (!rawKey.startsWith('ok_') && deps.jwtSecret) {
            const user = verifySupabaseJwt(rawKey, deps.jwtSecret);
            if (!user) {
                return reply.code(401).send({ error: 'INVALID_USER_TOKEN' });
            }
            const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.trim();
            if (!workspaceId) {
                return reply.code(400).send({ error: 'MISSING_WORKSPACE_ID' });
            }
            const memberRows = await deps.sql<{ role: string }[]>`
                select role from public.workspace_members
                 where workspace_id = ${workspaceId} and user_id = ${user.sub}
                 limit 1
            `;
            const role = memberRows[0]?.role;
            if (!role) {
                return reply.code(403).send({ error: 'NOT_A_WORKSPACE_MEMBER' });
            }
            req.workspaceId = workspaceId;
            req.userId = user.sub;
            req.scopes = scopesForRole(role);
            return;
        }

        const hash = createHash('sha256').update(rawKey).digest('hex');

        const rows = await deps.sql<ApiKeyRow[]>`
            select id, workspace_id, scopes, expires_at
              from public.workspace_api_keys
             where key_hash = ${hash} and revoked_at is null
             limit 1
        `;
        const row = rows[0];
        if (!row) {
            return reply.code(401).send({ error: 'INVALID_OR_REVOKED_KEY' });
        }

        if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
            return reply.code(401).send({ error: 'EXPIRED_KEY' });
        }

        // Met à jour last_used_at sans bloquer (best-effort, mais attendu pour
        // garantir la cohérence du suivi avant de poursuivre la requête).
        await deps.sql`
            update public.workspace_api_keys
               set last_used_at = now()
             where id = ${row.id}
        `;

        req.workspaceId = row.workspace_id;
        req.apiKeyId = row.id;
        req.scopes = row.scopes ?? [];
    };
}
