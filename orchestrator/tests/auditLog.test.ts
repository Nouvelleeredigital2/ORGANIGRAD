import { describe, it, expect, vi } from 'vitest';
import { PgAuditTrail, noopAuditTrail, type AuditEntry } from '../src/observability/auditLog.js';

const entry: AuditEntry = {
    workspaceId: 'ws-1',
    actorKind: 'api_key',
    actorId: 'key-1',
    action: 'human:approve',
    resourceType: 'node',
    resourceId: 'n-1',
    result: 'success',
};

describe('PgAuditTrail', () => {
    it('insère une entrée via le client SQL', async () => {
        const calls: unknown[][] = [];
        const sql = Object.assign(
            vi.fn((_s: TemplateStringsArray, ...args: unknown[]) => {
                calls.push(args);
                return Promise.resolve([]);
            }),
            { json: (v: unknown) => v },
        ) as unknown as import('postgres').Sql;

        await new PgAuditTrail(sql).record(entry);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('ws-1');
        expect(calls[0]).toContain('human:approve');
    });

    it('best-effort : un échec SQL ne propage pas d\'erreur', async () => {
        const sql = Object.assign(
            vi.fn(() => Promise.reject(new Error('db down'))),
            { json: (v: unknown) => v },
        ) as unknown as import('postgres').Sql;

        await expect(new PgAuditTrail(sql).record(entry)).resolves.toBeUndefined();
    });

    it('noopAuditTrail ne fait rien', async () => {
        await expect(noopAuditTrail.record(entry)).resolves.toBeUndefined();
    });
});
