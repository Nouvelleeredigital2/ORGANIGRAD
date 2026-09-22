import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';
import { buildHierarchy } from './buildHierarchy';

const normalizeLabel = (value: string): string => {
    return value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

const GRADE_SCORE: Record<Agent['gradeStyle'], number> = {
    Direction: 400,
    Responsable: 300,
    Expert: 200,
    Support: 100,
    Agent: 0,
};

const getLeadershipScore = (agent: Agent): number => {
    const haystack = normalizeLabel([agent.fonction, agent.titre, agent.service].filter(Boolean).join(' '));
    let score = GRADE_SCORE[agent.gradeStyle] || 0;

    if (haystack.includes('maire')) score += 3000;
    if (haystack.includes('directeur general') || haystack.includes('directrice generale') || haystack.includes('dgs')) score += 2500;
    if (haystack.includes('dga') || haystack.includes('d.g.a')) score += 2200;
    if (haystack.includes('dst')) score += 2100;
    if (haystack.includes('dir. pole') || haystack.includes('directeur') || haystack.includes('directrice')) score += 1800;
    if (haystack.includes('chef de cabinet') || haystack.includes('chef de service') || haystack.includes('responsable')) score += 1200;

    return score;
};

const isBranchLeader = (agent: Agent, rootId: string): boolean => {
    if (agent.id === rootId) {
        return false;
    }

    if (agent.gradeStyle === 'Responsable') {
        return true;
    }

    if (agent.gradeStyle === 'Direction') {
        return true;
    }

    const haystack = normalizeLabel([agent.fonction, agent.titre].filter(Boolean).join(' '));
    return haystack.includes('chef de service') || haystack.includes('responsable');
};

/**
 * Construit l'arbre d'un pôle.
 *
 * Deux régimes, dans cet ordre :
 *
 *  1. **Rattachement explicite** — dès qu'au moins un agent porte un
 *     `rattachementId`, il fait foi. C'est le cas des données persistées, où la
 *     hiérarchie est une donnée à part entière que l'utilisateur peut corriger.
 *
 *  2. **Heuristique** — sinon seulement, on déduit la hiérarchie de mots-clés
 *     de fonction (« DGS », « directeur », « chef de service »…). Ce régime
 *     dépend de L'ORDRE DES LIGNES : réordonner le CSV change l'organigramme.
 *     Il n'est conservé que pour les sources brutes sans rattachement.
 */
export const buildPoleHierarchy = (agents: Agent[]): TreeNode[] => {
    if (agents.length === 0) {
        return [];
    }

    const hasExplicitLinks = agents.some((agent) => Boolean(agent.rattachementId));
    if (hasExplicitLinks) {
        return buildHierarchy(agents);
    }

    const enrichedAgents = agents.map((agent) => ({ ...agent }));
    // agents.length > 0 garanti ci-dessus → enrichedAgents[0] existe.
    const root = enrichedAgents.reduce((bestAgent, currentAgent) => {
        return getLeadershipScore(currentAgent) > getLeadershipScore(bestAgent) ? currentAgent : bestAgent;
    }, enrichedAgents[0]!);

    type WithRattachement = typeof enrichedAgents[number] & { rattachementId: string | null };

    const linkedAgents = enrichedAgents.reduce<{ acc: WithRattachement[]; leaderId: string | null }>(
        ({ acc, leaderId }, agent) => {
            if (agent.id === root.id) {
                return { acc: [...acc, { ...agent, rattachementId: null }], leaderId: null };
            }
            if (isBranchLeader(agent, root.id)) {
                return {
                    acc: [...acc, { ...agent, rattachementId: root.id }],
                    leaderId: agent.id,
                };
            }
            return {
                acc: [...acc, { ...agent, rattachementId: leaderId ?? root.id }],
                leaderId,
            };
        },
        { acc: [], leaderId: null },
    ).acc;

    return buildHierarchy(linkedAgents);
};
