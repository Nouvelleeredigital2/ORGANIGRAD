export type BorealStage =
    | 'veille'
    | 'selection'
    | 'redaction'
    | 'brief_visuel'
    | 'generation'
    | 'controle'
    | 'validation_finale';

export type BorealExecutionState =
    | 'BROUILLON'
    | 'EN_ATTENTE_DU_CHOIX'
    | 'EN_ATTENTE_ENGINE'
    | 'A_CONTROLER'
    | 'VALIDE_PRET_A_PUBLIER';

export interface ProjectRef {
    ownerApplication: string;
    projectId: string;
    workspaceId: string;
    canonicalUrl: string;
}

export interface BorealCommand {
    project: ProjectRef;
    dossierId: string;
    stage: BorealStage;
    deliverableVersion: number;
    idempotencyKey: string;
}

const STAGES = new Set<BorealStage>([
    'veille', 'selection', 'redaction', 'brief_visuel', 'generation', 'controle', 'validation_finale',
]);

function nonEmpty(value: string, field: string): void {
    if (!value.trim()) throw new Error(`${field} est requis`);
}

export function createBorealCommand(input: BorealCommand): BorealCommand {
    nonEmpty(input.project.ownerApplication, 'project.ownerApplication');
    nonEmpty(input.project.projectId, 'project.projectId');
    nonEmpty(input.project.workspaceId, 'project.workspaceId');
    nonEmpty(input.project.canonicalUrl, 'project.canonicalUrl');
    nonEmpty(input.dossierId, 'dossierId');
    nonEmpty(input.idempotencyKey, 'idempotencyKey');
    if (!STAGES.has(input.stage)) throw new Error('stage Boréal invalide');
    if (!Number.isInteger(input.deliverableVersion) || input.deliverableVersion < 1) {
        throw new Error('deliverableVersion doit être un entier positif');
    }
    return Object.freeze({
        project: Object.freeze({ ...input.project }),
        dossierId: input.dossierId,
        stage: input.stage,
        deliverableVersion: input.deliverableVersion,
        idempotencyKey: input.idempotencyKey,
    });
}
