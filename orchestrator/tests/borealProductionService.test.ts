import { describe, expect, it, vi } from 'vitest';
import { createBorealCommand, type BorealCommand, type ProjectRef } from '../src/domain/borealProduction.js';
import { BorealProductionService, type BorealEditorialPort, type BorealEnginePort, type BorealLinkPort } from '../src/services/borealProductionService.js';

const project: ProjectRef = {
    ownerApplication: 'organigrad',
    projectId: '38ceb582-a40c-450d-9ec3-957fd8e69aa5',
    workspaceId: '1ed4895e-0000-4000-8000-000000000001',
    canonicalUrl: 'https://organigrad.example.test/projects/boreal-production',
};

function command(stage: BorealCommand['stage'], key: string, version = 1): BorealCommand {
    return createBorealCommand({ project, dossierId: 'dossier-boreal-001', stage, deliverableVersion: version, idempotencyKey: key });
}

function ports(engineAvailable = true): { editorial: BorealEditorialPort; link: BorealLinkPort; engine: BorealEnginePort } {
    return {
        editorial: {
            ensureDossier: vi.fn().mockResolvedValue({ externalDossierId: 'orvion-001' }),
            saveWatch: vi.fn().mockResolvedValue(undefined),
            saveArticle: vi.fn().mockResolvedValue(undefined),
            saveGraphicBrief: vi.fn().mockResolvedValue(undefined),
        },
        link: { recordTopicSelection: vi.fn().mockResolvedValue(undefined) },
        engine: {
            submitGraphicTask: vi.fn().mockResolvedValue(engineAvailable
                ? { kind: 'submitted', taskId: 'engine-001' }
                : { kind: 'unavailable' }),
        },
    };
}

describe('BorealProductionService', () => {
    it('creates one Orvion dossier for repeated manual starts with the same key', async () => {
        const p = ports();
        const service = new BorealProductionService(p);
        const topics = [{ id: 'topic-1', title: 'Sobriété numérique', sourceUrl: 'https://source.example.test/a' }];

        const first = await service.start(command('veille', 'start-001'), topics);
        const repeated = await service.start(command('veille', 'start-001'), topics);

        expect(p.editorial.ensureDossier).toHaveBeenCalledTimes(1);
        expect(p.editorial.saveWatch).toHaveBeenCalledTimes(1);
        expect(repeated).toEqual(first);
        expect(first.state).toBe('EN_ATTENTE_DU_CHOIX');
    });

    it('does not create an article before the person chose a sourced topic in LINK', async () => {
        const p = ports();
        const service = new BorealProductionService(p);
        await service.start(command('veille', 'start-001'), [{ id: 'topic-1', title: 'Sobriété numérique', sourceUrl: 'https://source.example.test/a' }]);

        await expect(service.saveArticle(command('redaction', 'article-001'), { title: 'Article', body: 'Texte' }))
            .rejects.toThrow(/sujet/i);
        expect(p.editorial.saveArticle).not.toHaveBeenCalled();
    });

    it('records the LINK decision once then accepts the article for the chosen topic', async () => {
        const p = ports();
        const service = new BorealProductionService(p);
        await service.start(command('veille', 'start-001'), [{ id: 'topic-1', title: 'Sobriété numérique', sourceUrl: 'https://source.example.test/a' }]);

        await service.chooseTopic(command('selection', 'selection-001'), 'topic-1');
        await service.saveArticle(command('redaction', 'article-001'), { title: 'Article', body: 'Texte' });

        expect(p.link.recordTopicSelection).toHaveBeenCalledTimes(1);
        expect(p.editorial.saveArticle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topicId: 'topic-1' }));
    });

    it('keeps the graphic prompt and waits when Engine is unavailable', async () => {
        const p = ports(false);
        const service = new BorealProductionService(p);
        await service.start(command('veille', 'start-001'), [{ id: 'topic-1', title: 'Sobriété numérique', sourceUrl: 'https://source.example.test/a' }]);
        await service.chooseTopic(command('selection', 'selection-001'), 'topic-1');

        const receipt = await service.requestGraphic(command('generation', 'graphic-001'), 'A calm boreal forest illustration');

        expect(receipt).toMatchObject({ state: 'EN_ATTENTE_ENGINE', graphicPrompt: 'A calm boreal forest illustration' });
        expect(p.engine.submitGraphicTask).toHaveBeenCalledTimes(1);
    });
});
