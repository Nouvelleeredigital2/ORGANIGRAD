import {
    createBorealCommand,
    type BorealCommand,
    type BorealExecutionState,
    type ProjectRef,
} from '../domain/borealProduction.js';

export interface BorealTopic {
    id: string;
    title: string;
    sourceUrl: string;
}

export interface BorealEditorialPort {
    ensureDossier(command: BorealCommand): Promise<{ externalDossierId: string }>;
    saveWatch(command: BorealCommand, topics: readonly BorealTopic[]): Promise<void>;
    saveArticle(command: BorealCommand, article: { topicId: string; title: string; body: string }): Promise<void>;
    saveGraphicBrief(command: BorealCommand, brief: { topicId: string; prompt: string }): Promise<void>;
}

export interface BorealLinkPort {
    recordTopicSelection(command: BorealCommand, topic: BorealTopic): Promise<void>;
}

export interface BorealEnginePort {
    submitGraphicTask(command: BorealCommand, prompt: string): Promise<
        | { kind: 'submitted'; taskId: string }
        | { kind: 'unavailable' }
    >;
}

export interface BorealReceipt {
    project: ProjectRef;
    dossierId: string;
    externalDossierId: string;
    state: BorealExecutionState;
    topics: readonly BorealTopic[];
    selectedTopicId: string | null;
    graphicPrompt: string | null;
    engineTaskId: string | null;
}

interface DossierState extends BorealReceipt {}

function dossierKey(project: ProjectRef, dossierId: string): string {
    return `${project.ownerApplication}:${project.workspaceId}:${project.projectId}:${dossierId}`;
}

function copy(receipt: BorealReceipt): BorealReceipt {
    return {
        ...receipt,
        project: { ...receipt.project },
        topics: receipt.topics.map((topic) => ({ ...topic })),
    };
}

function requireStage(command: BorealCommand, stage: BorealCommand['stage']): void {
    if (command.stage !== stage) throw new Error(`La commande doit viser l'étape ${stage}`);
}

export class BorealProductionService {
    private readonly commands = new Map<string, BorealReceipt>();
    private readonly dossiers = new Map<string, DossierState>();

    constructor(private readonly ports: {
        editorial: BorealEditorialPort;
        link: BorealLinkPort;
        engine: BorealEnginePort;
    }) {}

    async start(rawCommand: BorealCommand, topics: readonly BorealTopic[]): Promise<BorealReceipt> {
        const command = createBorealCommand(rawCommand);
        requireStage(command, 'veille');
        const existingCommand = this.commands.get(command.idempotencyKey);
        if (existingCommand) return copy(existingCommand);
        if (!topics.length || topics.some((topic) => !topic.id.trim() || !topic.title.trim() || !topic.sourceUrl.trim())) {
            throw new Error('La veille doit contenir au moins un sujet sourcé');
        }

        const key = dossierKey(command.project, command.dossierId);
        const current = this.dossiers.get(key);
        if (current) {
            const receipt = copy(current);
            this.commands.set(command.idempotencyKey, receipt);
            return receipt;
        }

        const created = await this.ports.editorial.ensureDossier(command);
        await this.ports.editorial.saveWatch(command, topics);
        const receipt: DossierState = {
            project: { ...command.project },
            dossierId: command.dossierId,
            externalDossierId: created.externalDossierId,
            state: 'EN_ATTENTE_DU_CHOIX',
            topics: topics.map((topic) => ({ ...topic })),
            selectedTopicId: null,
            graphicPrompt: null,
            engineTaskId: null,
        };
        this.dossiers.set(key, receipt);
        this.commands.set(command.idempotencyKey, copy(receipt));
        return copy(receipt);
    }

    async chooseTopic(rawCommand: BorealCommand, topicId: string): Promise<BorealReceipt> {
        const command = createBorealCommand(rawCommand);
        requireStage(command, 'selection');
        const replay = this.commands.get(command.idempotencyKey);
        if (replay) return copy(replay);
        const dossier = this.requireDossier(command);
        if (dossier.selectedTopicId) throw new Error('Un sujet a déjà été choisi pour ce dossier');
        const topic = dossier.topics.find((candidate) => candidate.id === topicId);
        if (!topic) throw new Error('Le sujet doit appartenir à la veille sourcée du dossier');

        await this.ports.link.recordTopicSelection(command, topic);
        dossier.selectedTopicId = topic.id;
        dossier.state = 'BROUILLON';
        const receipt = copy(dossier);
        this.commands.set(command.idempotencyKey, receipt);
        return receipt;
    }

    async saveArticle(rawCommand: BorealCommand, article: { title: string; body: string }): Promise<BorealReceipt> {
        const command = createBorealCommand(rawCommand);
        requireStage(command, 'redaction');
        const replay = this.commands.get(command.idempotencyKey);
        if (replay) return copy(replay);
        const dossier = this.requireDossier(command);
        if (!dossier.selectedTopicId) throw new Error('Un sujet doit être choisi dans LINK avant la rédaction');
        if (!article.title.trim() || !article.body.trim()) throw new Error('L’article doit avoir un titre et un contenu');

        await this.ports.editorial.saveArticle(command, { ...article, topicId: dossier.selectedTopicId });
        dossier.state = 'BROUILLON';
        const receipt = copy(dossier);
        this.commands.set(command.idempotencyKey, receipt);
        return receipt;
    }

    async requestGraphic(rawCommand: BorealCommand, prompt: string): Promise<BorealReceipt> {
        const command = createBorealCommand(rawCommand);
        requireStage(command, 'generation');
        const replay = this.commands.get(command.idempotencyKey);
        if (replay) return copy(replay);
        const dossier = this.requireDossier(command);
        if (!dossier.selectedTopicId) throw new Error('Un sujet doit être choisi dans LINK avant le brief visuel');
        if (!prompt.trim()) throw new Error('Le prompt visuel est requis');

        await this.ports.editorial.saveGraphicBrief(command, { topicId: dossier.selectedTopicId, prompt });
        const engine = await this.ports.engine.submitGraphicTask(command, prompt);
        dossier.graphicPrompt = prompt;
        dossier.engineTaskId = engine.kind === 'submitted' ? engine.taskId : null;
        dossier.state = 'EN_ATTENTE_ENGINE';
        const receipt = copy(dossier);
        this.commands.set(command.idempotencyKey, receipt);
        return receipt;
    }

    get(project: ProjectRef, dossierId: string): BorealReceipt | null {
        const receipt = this.dossiers.get(dossierKey(project, dossierId));
        return receipt ? copy(receipt) : null;
    }

    private requireDossier(command: BorealCommand): DossierState {
        const dossier = this.dossiers.get(dossierKey(command.project, command.dossierId));
        if (!dossier) throw new Error('Dossier Boréal introuvable : lancez d’abord la veille');
        return dossier;
    }
}
