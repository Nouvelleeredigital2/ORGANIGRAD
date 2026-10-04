import { describe, expect, it, vi } from 'vitest';
import {
    SuiteLaunchError, createSuiteHub, createSuiteLaunchService, parseGrantCommand,
    parseLaunchRedemption, parsePrepareCommand, PgSuiteNativeStore, type LaunchRedemption, type SuiteNativeStore,
} from '../src/synapse/suiteLaunch.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
type FakeSql = {
    (parts: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    begin(callback: (tx: FakeSql) => Promise<unknown>): Promise<unknown>;
};
const launch: LaunchRedemption = {
    launchId: '44444444-4444-4444-8444-444444444444', suiteUserId: 'suite-user', workspaceId: 'suite-workspace', role: 'member',
    idempotencyKey: `suite-workspace/${PROJECT}/organigrad`, project: { scopeId: PROJECT, name: 'Projet commun' },
    nativeSpace: null, accountLink: null, confirmBefore: '2026-10-04T12:10:00.000Z',
};

function native(): SuiteNativeStore {
    return {
        open: vi.fn(async input => ({ nativeWorkspaceId: input.workspaceId, nativeProjectId: input.projectId,
            canonicalUrl: `https://organigrad.example/?v=projects&project=${input.projectId}&workspace=${input.workspaceId}` })),
        prepare: vi.fn(), lookup: vi.fn(), grant: vi.fn(), revoke: vi.fn(),
    };
}

describe('ouverture projet Synapse', () => {
    it('laisse un membre autorisé rouvrir un projet créé initialement par un autre membre', async () => {
        const creator = '55555555-5555-4555-8555-555555555555';
        const sql = vi.fn(async (parts: TemplateStringsArray) => {
            const query = parts.join('?');
            if (query.includes('select set_config')) return [];
            if (query.includes('from public.workspace_members')) return [{ role: 'member' }];
            if (query.includes('select id,workspace_id from public.projects')) return [{ id: PROJECT, workspace_id: WORKSPACE }];
            if (query.includes('select project_id,workspace_id,synapse_workspace_id')) return [{
                project_id: PROJECT, workspace_id: WORKSPACE, synapse_workspace_id: 'suite-workspace',
                idempotency_key: `suite-workspace/${PROJECT}/organigrad`, created_by: creator,
            }];
            return [];
        }) as unknown as FakeSql;
        sql.begin = async callback => callback(sql);
        const store = new PgSuiteNativeStore(sql as never, 'https://organigrad.example');
        await expect(store.open({ userId: USER, workspaceId: WORKSPACE, projectId: PROJECT,
            projectName: 'Projet commun', synapseWorkspaceId: 'suite-workspace',
            idempotencyKey: `suite-workspace/${PROJECT}/organigrad` })).resolves.toMatchObject({
            nativeWorkspaceId: WORKSPACE, nativeProjectId: PROJECT,
        });
    });

    it('refuse les réponses incomplètes, les URL non HTTPS et les ProjectRef non UUID', () => {
        expect(() => parseLaunchRedemption({ ...launch, project: { ...launch.project, scopeId: 'opaque' } })).toThrow('SYNAPSE_RESPONSE_INVALID');
        expect(() => parseLaunchRedemption({ ...launch, nativeSpace: { id: 's', nativeRef: { nativeWorkspaceId: WORKSPACE, nativeProjectId: PROJECT, canonicalUrl: 'http://remote.test/x' } } })).toThrow('SYNAPSE_RESPONSE_INVALID');
    });

    it('persiste le même ProjectRef avant de confirmer le compte et le workspace natifs', async () => {
        const events: string[] = [], store = native();
        vi.mocked(store.open).mockImplementation(async input => { events.push('open'); return { nativeWorkspaceId: input.workspaceId, nativeProjectId: input.projectId, canonicalUrl: 'https://organigrad.example/' }; });
        const hub = { redeem: vi.fn(async () => launch), confirm: vi.fn(async () => { events.push('confirm'); }) };
        const service = createSuiteLaunchService(hub, store, () => Date.parse('2026-10-04T12:00:00.000Z'));
        await expect(service.open('A'.repeat(43), { userId: USER, workspaceId: WORKSPACE })).resolves.toEqual({
            projectId: PROJECT, workspaceId: WORKSPACE,
            redirect: `/?v=projects&project=${PROJECT}&workspace=${WORKSPACE}`,
        });
        expect(store.open).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, workspaceId: WORKSPACE, projectId: PROJECT }));
        expect(hub.confirm).toHaveBeenCalledWith(launch.launchId, USER, WORKSPACE);
        expect(events).toEqual(['open', 'confirm']);
    });

    it('refuse une liaison de compte ou un espace natif différents avant toute écriture', async () => {
        const store = native();
        for (const changed of [
            { accountLink: { nativeAccountId: 'other', nativeWorkspaceId: WORKSPACE } },
            { accountLink: { nativeAccountId: USER, nativeWorkspaceId: 'other' } },
            { nativeSpace: { id: 's', nativeRef: { nativeAccountId: USER, nativeWorkspaceId: WORKSPACE, nativeProjectId: '55555555-5555-4555-8555-555555555555', canonicalUrl: 'https://organigrad.example/' } } },
        ]) {
            const service = createSuiteLaunchService({ redeem: async () => ({ ...launch, ...changed } as LaunchRedemption), confirm: vi.fn() }, store, () => Date.parse('2026-10-04T12:00:00.000Z'));
            await expect(service.open('A'.repeat(43), { userId: USER, workspaceId: WORKSPACE })).rejects.toBeInstanceOf(SuiteLaunchError);
        }
        expect(store.open).not.toHaveBeenCalled();
    });

    it('échange et confirme uniquement côté serveur avec le jeton applicatif', async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify(launch), { status: 200 }));
        const hub = createSuiteHub('https://synapse.example', 'server-secret-token', fetcher as typeof fetch);
        await hub.redeem('A'.repeat(43));
        expect(fetcher).toHaveBeenCalledWith('https://synapse.example/api/suite/launch/redeem', expect.objectContaining({
            method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer server-secret-token' }),
        }));
    });
});

describe('commandes de préparation', () => {
    it('accepte le contrat strict Organigrad et refuse un autre appId', () => {
        const prepare = { idempotencyKey: 'w/p/organigrad', contentSha256: 'a'.repeat(64), workspaceId: 'suite-ws', companyId: '', scopeId: PROJECT,
            projectName: 'Projet', appId: 'organigrad', operation: 'create', nativeRef: null, requestedBy: 'suite-user', nativeAccountId: USER };
        expect(parsePrepareCommand(prepare)).toEqual(prepare);
        expect(() => parsePrepareCommand({ ...prepare, appId: 'other' })).toThrow('PREPARE_COMMAND_INVALID');
        const grant = { idempotencyKey: 'w/p/organigrad', workspaceId: 'suite-ws', companyId: '', scopeId: PROJECT, appId: 'organigrad',
            nativeRef: { nativeWorkspaceId: WORKSPACE, nativeProjectId: PROJECT, canonicalUrl: 'https://organigrad.example/' }, ownerNativeAccountId: USER,
            nativeAccountId: '55555555-5555-4555-8555-555555555555', requestedBy: 'suite-user' };
        expect(parseGrantCommand(grant)).toEqual(grant);
    });
});
