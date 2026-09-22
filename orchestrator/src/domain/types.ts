/**
 * Domaine partagé — réutilise EXACTEMENT la définition de `HybridNode` du
 * KNOWLEDGE-BASE (cf. section 4 de la KB Organigrad).
 *
 * Ces types sont autoritatifs côté orchestrateur. La SPA possède sa propre
 * copie alignée (src/types/hybridNode.ts) ; les deux doivent rester synchrones.
 */

/**
 * Valeur JSON sérialisable — utilisée pour typer les payloads de transition
 * stockés en `jsonb` (colonne `node_transitions.payload`). Évite tout cast
 * dangereux (`as never`) au moment de l'INSERT.
 */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue | undefined };

export type JsonObject = { [key: string]: JsonValue | undefined };

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
 * courant. Tout affichage de `presence` DOIT afficher `observedAt` avec.
 */
export interface SourceObservation {
    /** Valeur brute rapportée par la source (ex. 'online'). */
    presence?: string;
    /** Date ISO du relevé. */
    observedAt?: string;
    /** Cadence déclarée (ex. 'à la demande (gate 3)', 'hebdo lundi 8h00'). */
    cadence?: string;
}

export interface HybridNode {
    id: string;
    /** Version de lecture utilisée pour détecter les écritures concurrentes. */
    updated_at?: string;
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

    /**
     * Ce que l'application source dit de ce nœud (import LINK). En lecture
     * seule côté Organigrad : jamais écrit par une édition de nœud, seulement
     * par l'import. Absent pour un nœud natif.
     */
    sourceObservation?: SourceObservation;
}
