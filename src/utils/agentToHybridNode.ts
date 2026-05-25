import type { Agent } from '../types/agent';
import type { HybridNode } from '../types/hybridNode';

/**
 * Adapter Agent (legacy RH, alimenté par CSV) → HybridNode (nouveau modèle).
 *
 * Tant que le pipeline CSV n'est pas remplacé par une source MCP-native,
 * cet adapter projette une fiche RH en nœud `HUMAN` de l'organigramme hybride.
 * Les agents IA et les serveurs MCP arrivent par d'autres sources et n'ont
 * pas besoin de cette conversion.
 */
export function agentToHybridNode(agent: Agent): HybridNode {
    const fullName = [agent.prenom, agent.nom].filter(Boolean).join(' ').trim() || agent.nom;
    return {
        id: agent.id,
        type: 'HUMAN',
        nom: fullName,
        roleTitre: agent.titre || agent.fonction,
        parentID: agent.rattachementId,
        gradeId: agent.gradeStyle,
        avatarUrl: agent.avatarUrl,
        notificationChannels: agent.email ? { email: agent.email } : undefined,
        status: 'IDLE',
    };
}
