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
    /** Canal Telegram d'un bot importé (ex. 'telegram-hermes' — informatif). */
    telegram?: string;
}

/**
 * Observation d'un nœud chez l'application qui le possède (ex. LINK/Hermès),
 * relevée au moment de l'import.
 *
 * DISTINCT de `status` : `status` est l'état d'exécution DANS Organigrad
 * (machine à transitions), `presence` est ce que la source dit de son agent.
 * Un bot `online` qui n'exécute rien est `IDLE` — les deux sont vrais.
 *
 * `observedAt` n'est pas décoratif : une présence est volatile et l'import est
 * manuel. Sans sa date, l'interface présenterait un relevé ancien comme l'état
 * courant — la même faute que servir un cache `stale` pour la vérité du moment.
 * Tout affichage de `presence` DOIT afficher `observedAt` avec.
 */
export interface SourceObservation {
    /** Valeur brute rapportée par la source (ex. 'online'). */
    presence?: string;
    /** Date ISO du relevé. */
    observedAt?: string;
    /** Cadence déclarée (ex. 'à la demande (gate 3)', 'hebdo lundi 8h00'). */
    cadence?: string;
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
    /** Version de lecture utilisée par le verrou optimiste côté serveur. */
    updated_at?: string;
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
     * Ce que l'application source dit de ce nœud (import LINK). LECTURE SEULE :
     * jamais renvoyé au serveur par une édition — `nodeToInsert` l'omet
     * délibérément, sans quoi enregistrer une fiche effacerait l'observation.
     * Absent pour un nœud natif Organigrad.
     */
    sourceObservation?: SourceObservation;

    /**
     * Champs chiffrés côté serveur. Absent en mode local (rien n'est chiffré).
     * Ne JAMAIS renvoyer ce drapeau au serveur : il décrit un état de lecture.
     */
    encrypted?: EncryptedFields;
}
