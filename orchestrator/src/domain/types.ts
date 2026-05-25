/**
 * Domaine partagé — réutilise EXACTEMENT la définition de `HybridNode` du
 * KNOWLEDGE-BASE (cf. section 4 de la KB Organigrad).
 *
 * Ces types sont autoritatifs côté orchestrateur. La SPA possède sa propre
 * copie alignée (src/types/hybridNode.ts) ; les deux doivent rester synchrones.
 */

export type NodeType = 'HUMAN' | 'AGENT_IA' | 'SOFTWARE_MCP';

export type NodeStatus =
    | 'IDLE'
    | 'EXECUTING'
    | 'CONTROL_PENDING_IA'
    | 'WAITING_HUMAN_APPROVAL'
    | 'ERROR';

export interface McpConfig {
    serverUrl: string;
    connectedTo: string[];
}

export interface NotificationChannels {
    slackWebhook?: string;
    email?: string;
    whatsappId?: string;
}

export interface HybridNode {
    id: string;
    type: NodeType;
    nom: string;
    roleTitre: string;
    parentID: string | null;
    /** Gestion dynamique des rôles et autorisations. */
    gradeId: string;

    // Spécificités IA & Logicielles
    systemPrompt?: string;
    skills?: string[];
    mcpConfig?: McpConfig;

    // Spécificité Humain (Gatekeeper) — canaux de notification HITL
    notificationChannels?: NotificationChannels;

    avatarUrl?: string;

    status: NodeStatus;
}
