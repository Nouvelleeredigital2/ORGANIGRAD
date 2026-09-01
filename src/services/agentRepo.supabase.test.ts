import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../types/agent';

const supabaseMock = vi.hoisted(() => {
    const query = {
        update: vi.fn(),
        upsert: vi.fn(),
        eq: vi.fn(),
        select: vi.fn(),
        single: vi.fn(),
        maybeSingle: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
    };

    query.update.mockReturnValue(query);
    query.upsert.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);

    return {
        query,
        client: { from: vi.fn(() => query), rpc: vi.fn() },
    };
});

vi.mock('../lib/supabase', () => ({
    supabase: supabaseMock.client,
}));

import { agentRepo, rowToAgent } from './agentRepo';

const version = '2026-09-01T12:00:00.000Z';
const baseAgent: Agent = {
    id: 'agent-1',
    nom: 'DUPONT',
    prenom: 'Jean',
    fonction: 'Agent',
    titre: '',
    service: 'Voirie',
    pole: 'TECHNIQUE',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
    updated_at: version,
};

const baseRow = {
    id: baseAgent.id,
    workspace_id: 'workspace-1',
    source_kind: 'manual',
    source_ref: '',
    external_key: baseAgent.id,
    nom: baseAgent.nom,
    prenom: baseAgent.prenom,
    fonction: baseAgent.fonction,
    titre: baseAgent.titre,
    service: baseAgent.service,
    pole: baseAgent.pole,
    rattachement_id: null,
    grade_style: baseAgent.gradeStyle,
    type_temps: baseAgent.typeTemps,
    nbi: null,
    avatar_url: null,
    email: null,
    phone: null,
    created_by: null,
    updated_by: null,
    created_at: version,
    updated_at: version,
};

describe('agentRepo — concurrence legacy org_agents', () => {
    it('préserve updated_at lors de la conversion Supabase', () => {
        expect(rowToAgent(baseRow).updated_at).toBe(version);
    });

    it('versionne une mise à jour Supabase et signale un conflit typé', async () => {
        supabaseMock.query.update.mockClear();
        supabaseMock.query.upsert.mockClear();
        supabaseMock.query.eq.mockClear();
        supabaseMock.query.maybeSingle.mockResolvedValue({ data: null, error: null });

        await expect(agentRepo.upsert(baseAgent, { workspaceId: 'workspace-1' }))
            .rejects.toMatchObject({ name: 'AgentConflictError', agentId: baseAgent.id });

        expect(supabaseMock.query.update).toHaveBeenCalledOnce();
        expect(supabaseMock.query.upsert).not.toHaveBeenCalled();
        expect(supabaseMock.query.eq).toHaveBeenNthCalledWith(1, 'id', baseAgent.id);
        expect(supabaseMock.query.eq).toHaveBeenNthCalledWith(2, 'workspace_id', 'workspace-1');
        expect(supabaseMock.query.eq).toHaveBeenNthCalledWith(3, 'updated_at', version);
    });

    it('transmet la version de la source à la RPC d import de masse', async () => {
        supabaseMock.query.maybeSingle.mockResolvedValueOnce({ data: { updated_at: version }, error: null });
        supabaseMock.client.rpc.mockResolvedValueOnce({
            data: [{ inserted: 0, updated: 1, deleted: 0 }],
            error: null,
        });

        await agentRepo.bulkUpsert([baseAgent], { workspaceId: 'workspace-1' }, {
            sourceKind: 'manual',
            sourceRef: '',
            mode: 'merge',
        });

        expect(supabaseMock.client.rpc).toHaveBeenCalledWith(
            'import_org_agents',
            expect.objectContaining({ p_expected_updated_at: version }),
        );
    });
});
