import type { Sql } from 'postgres';
import type { JsonObject } from '../domain/types.js';

/**
 * Journal d'audit des actions sensibles (Phase 3).
 *
 * Enregistre QUI a fait QUOI sur QUELLE ressource avec QUEL résultat. Injectable
 * et best-effort : un échec d'écriture du journal ne doit JAMAIS faire échouer
 * l'action métier (on logue l'échec sans le propager).
 */

export interface AuditEntry {
    workspaceId: string;
    actorKind: 'user' | 'api_key' | 'orchestrator';
    actorId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    result: 'success' | 'denied' | 'error';
    metadata?: JsonObject | null;
    ip?: string | null;
    requestId?: string | null;
}

export interface AuditTrail {
    record(entry: AuditEntry): Promise<void>;
}

export class PgAuditTrail implements AuditTrail {
    constructor(private readonly sql: Sql) {}

    async record(e: AuditEntry): Promise<void> {
        try {
            await this.sql`
                insert into public.audit_log
                    (workspace_id, actor_kind, actor_id, action, resource_type,
                     resource_id, result, metadata, ip, request_id)
                values (
                    ${e.workspaceId}, ${e.actorKind}, ${e.actorId ?? null}, ${e.action},
                    ${e.resourceType}, ${e.resourceId ?? null}, ${e.result},
                    ${e.metadata ? this.sql.json(e.metadata) : null},
                    ${e.ip ?? null}, ${e.requestId ?? null}
                )
            `;
        } catch (err) {
            // Best-effort : ne jamais propager une erreur d'audit dans le flux métier.
            console.warn('[audit] échec écriture du journal', {
                action: e.action,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

/** Implémentation no-op (mode in-memory / tests sans DB). */
export const noopAuditTrail: AuditTrail = {
    async record() {
        /* no-op */
    },
};
