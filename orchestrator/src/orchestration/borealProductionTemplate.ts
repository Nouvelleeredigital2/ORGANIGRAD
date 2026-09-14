import { CircuitDefinitionSchema, type CircuitDefinition } from '@apps2026/contracts';

export interface BorealProductionTeam {
    project: CircuitDefinition['project'];
    ericId: string;
    designId: string;
    engineId: string;
    guardianId: string;
    humanId: string;
}

/**
 * Modèle du pilote réel. Il ne crée aucune donnée distante : la création du
 * projet, les activations et les mandats restent des gestes gouvernés. Il
 * fournit seulement une définition cohérente à enregistrer par les routes de
 * circuit persistantes déjà autorisées.
 */
export function createBorealProductionTemplate(team: BorealProductionTeam): CircuitDefinition {
    if (team.project.sourceApp !== 'organigrad') throw new Error('Boréal Production doit appartenir à OrganiGrad');
    const identities = [team.ericId, team.designId, team.engineId, team.guardianId, team.humanId];
    if (identities.some((id) => !id.trim()) || new Set(identities).size !== identities.length) {
        throw new Error('Les identités Boréal doivent être distinctes');
    }
    return CircuitDefinitionSchema.parse({
        name: 'Boréal Production — parcours éditorial',
        project: team.project,
        schedule: null,
        steps: [
            { id: 'veille', kind: 'watch', assigneeId: team.ericId, instructions: 'Produire une veille sourcée et citer chaque source utilisée.' },
            { id: 'selection', kind: 'selection', assigneeId: team.humanId, validatorKind: 'human', correctionStepId: 'veille', instructions: 'Choisir un sujet sourcé dans LINK.' },
            { id: 'redaction', kind: 'writing', assigneeId: team.ericId, instructions: 'Rédiger uniquement à partir du sujet choisi et des sources du dossier.' },
            { id: 'brief_visuel', kind: 'visual_brief', assigneeId: team.designId, instructions: 'Créer le brief visuel et le prompt destiné à Engine.' },
            { id: 'generation', kind: 'generation', assigneeId: team.engineId, instructions: 'Soumettre le prompt à Engine et rattacher seulement son résultat réel.' },
            { id: 'controle', kind: 'control', assigneeId: team.guardianId, instructions: 'Contrôler sources, brief et charte ; produire un rapport sans valider le dossier.' },
            { id: 'validation', kind: 'approval', assigneeId: team.humanId, validatorKind: 'human', correctionStepId: 'redaction', instructions: 'Valider humainement le dossier final ou demander une correction.' },
        ],
    });
}
