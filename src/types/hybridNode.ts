/**
 * Modèle de données central d'Organigrad — Phase 1 du pivot
 * "Plateforme d'Orchestration Hybride (Humain + IA + Logiciel) propulsée par MCP".
 *
 * Le concept legacy d'Agent RH est remplacé par un nœud universel hybride :
 *  - HUMAN        : décideur / garant (Human-In-The-Loop)
 *  - AGENT_IA     : créateur / superviseur autonome
 *  - SOFTWARE_MCP : filtre / vérificateur déterministe (serveur MCP)
 */

export type NodeType = 'HUMAN' | 'AGENT_IA' | 'SOFTWARE_MCP';

export type NodeStatus =
    | 'IDLE'
    | 'EXECUTING'
    | 'CONTROL_PENDING_IA'
    | 'WAITING_HUMAN_APPROVAL' // Validation humaine requise — géré via ValidationCenter (approve/reject)
    | 'ERROR';

export interface McpConfig {
    serverUrl: string;
    connectedTo: string[];
}

export interface NotificationChannels {
    slackWebhook?: string;
    email?: string;
    whatsappId?: string;
    /** Canal Telegram d'un bot importé (ex. 'telegram-hermes' — informatif). */
    telegram?: string;
}

/**
 * Champs stockés chiffrés côté serveur. La SPA n'a pas la clé : elle ne peut ni
 * les lire ni les réécrire à l'identique. Elle sait seulement qu'ils sont
 * configurés, et peut proposer un remplacement explicite.
 *
 * Un drapeau à `true` implique que la valeur correspondante est `undefined`
 * dans le nœud : il n'existe aucune représentation intermédiaire (sentinelle,
 * chaîne factice) susceptible d'être réécrite par erreur.
 */
export interface EncryptedFields {
    systemPrompt?: boolean;
    mcpConfig?: boolean;
    notificationChannels?: boolean;
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
    /** Outils MCP déclarés (skills dynamiques). */
    skills?: string[];
    mcpConfig?: McpConfig;

    // Spécificité Humain (Gatekeeper) — canaux de notification HITL
    notificationChannels?: NotificationChannels;

    // Visuels Humain
    avatarUrl?: string;

    status: NodeStatus;

    /**
     * Champs chiffrés côté serveur. Absent en mode local (rien n'est chiffré).
     * Ne JAMAIS renvoyer ce drapeau au serveur : il décrit un état de lecture.
     */
    encrypted?: EncryptedFields;
}
