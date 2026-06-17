import type { HybridNode } from '../domain/types.js';

/**
 * DTO public d'un nœud (Priorité 6).
 *
 * `GET /api/graph` ne doit JAMAIS renvoyer le modèle interne complet. Les champs
 * suivants sont confidentiels et ne sortent pas de l'orchestrateur :
 *   - systemPrompt           (prompt système confidentiel)
 *   - mcpConfig.serverUrl     (URL interne / endpoint MCP)
 *   - notificationChannels    (webhook Slack, e-mail, identifiants)
 *
 * À la place, on expose des INDICATEURS booléens (`configured`) qui permettent à
 * l'UI de savoir qu'une valeur existe sans jamais la divulguer.
 */
export interface PublicNodeDTO {
    id: string;
    type: HybridNode['type'];
    nom: string;
    roleTitre: string;
    parentID: string | null;
    gradeId: string;
    skills: string[];
    avatarUrl?: string;
    status: HybridNode['status'];
    /** Indicateurs non sensibles. */
    hasSystemPrompt: boolean;
    mcp: { configured: boolean; connectedTo: string[] };
    notifications: { slack: boolean; email: boolean; whatsapp: boolean };
}

export function toPublicNodeDTO(node: HybridNode): PublicNodeDTO {
    const nc = node.notificationChannels;
    return {
        id: node.id,
        type: node.type,
        nom: node.nom,
        roleTitre: node.roleTitre,
        parentID: node.parentID,
        gradeId: node.gradeId,
        skills: node.skills ?? [],
        avatarUrl: node.avatarUrl,
        status: node.status,
        hasSystemPrompt: Boolean(node.systemPrompt && node.systemPrompt.length > 0),
        mcp: {
            configured: Boolean(node.mcpConfig?.serverUrl),
            // connectedTo est une liste d'IDs de nœuds — non sensible.
            connectedTo: node.mcpConfig?.connectedTo ?? [],
        },
        notifications: {
            slack: Boolean(nc?.slackWebhook),
            email: Boolean(nc?.email),
            whatsapp: Boolean(nc?.whatsappId),
        },
    };
}
