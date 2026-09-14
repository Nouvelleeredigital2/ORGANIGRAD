import { describe, expect, it } from 'vitest';
import { createBorealProductionTemplate } from '../src/orchestration/borealProductionTemplate.js';

const project = {
    sourceApp: 'organigrad',
    workspaceId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    canonicalUrl: 'https://organigrad.example.test/projects/boreal-production',
};

describe('Boréal Production circuit template', () => {
    it('creates the seven-step human-governed editorial chain without a schedule', () => {
        const definition = createBorealProductionTemplate({
            project,
            ericId: '33333333-3333-4333-8333-333333333333',
            designId: '44444444-4444-4444-8444-444444444444',
            engineId: '55555555-5555-4555-8555-555555555555',
            guardianId: '66666666-6666-4666-8666-666666666666',
            humanId: '77777777-7777-4777-8777-777777777777',
        });

        expect(definition.project).toEqual(project);
        expect(definition.schedule).toBeNull();
        expect(definition.steps.map((step) => step.kind)).toEqual([
            'watch', 'selection', 'writing', 'visual_brief', 'generation', 'control', 'approval',
        ]);
        expect(definition.steps[0]).toMatchObject({ id: 'veille', assigneeId: '33333333-3333-4333-8333-333333333333' });
        expect(definition.steps[1]).toMatchObject({ id: 'selection', assigneeId: '77777777-7777-4777-8777-777777777777', validatorKind: 'human', correctionStepId: 'veille' });
        expect(definition.steps[5]).toMatchObject({ id: 'controle', assigneeId: '66666666-6666-4666-8666-666666666666' });
        expect(definition.steps[6]).toMatchObject({ id: 'validation', assigneeId: '77777777-7777-4777-8777-777777777777', validatorKind: 'human', correctionStepId: 'redaction' });
    });

    it('rejects a duplicate identity so a bot cannot silently validate its own work', () => {
        expect(() => createBorealProductionTemplate({
            project,
            ericId: '33333333-3333-4333-8333-333333333333',
            designId: '33333333-3333-4333-8333-333333333333',
            engineId: '55555555-5555-4555-8555-555555555555',
            guardianId: '66666666-6666-4666-8666-666666666666',
            humanId: '77777777-7777-4777-8777-777777777777',
        })).toThrow(/distinct/i);
    });
});
