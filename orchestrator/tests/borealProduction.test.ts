import { describe, expect, it } from 'vitest';
import { createBorealCommand, type ProjectRef } from '../src/domain/borealProduction.js';

const project: ProjectRef = {
    ownerApplication: 'organigrad',
    projectId: '38ceb582-a40c-450d-9ec3-957fd8e69aa5',
    workspaceId: '1ed4895e-0000-4000-8000-000000000001',
    canonicalUrl: 'https://organigrad.example.test/projects/boreal-production',
};

describe('Boréal Production command contract', () => {
    it('carries the complete immutable scope for an editorial command', () => {
        expect(createBorealCommand({
            project,
            dossierId: 'dossier-boreal-001',
            stage: 'veille',
            deliverableVersion: 1,
            idempotencyKey: 'boreal-001-veille-v1',
        })).toEqual({
            project,
            dossierId: 'dossier-boreal-001',
            stage: 'veille',
            deliverableVersion: 1,
            idempotencyKey: 'boreal-001-veille-v1',
        });
    });

    it.each([
        ['empty dossier', { dossierId: '' }],
        ['empty idempotency key', { idempotencyKey: '' }],
        ['zero version', { deliverableVersion: 0 }],
        ['unknown stage', { stage: 'publication' as never }],
        ['missing project URL', { project: { ...project, canonicalUrl: '' } }],
    ])('rejects %s', (_label, overrides) => {
        expect(() => createBorealCommand({
            project,
            dossierId: 'dossier-boreal-001',
            stage: 'veille',
            deliverableVersion: 1,
            idempotencyKey: 'boreal-001-veille-v1',
            ...overrides,
        })).toThrow();
    });
});
