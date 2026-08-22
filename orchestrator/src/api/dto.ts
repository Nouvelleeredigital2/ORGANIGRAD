import type { HybridNode, McpConfig, NotificationChannels, NodeType } from '../domain/types.js';

/**
 * Corps d'une requête de création/mise à jour de nœud.
 * Valeurs inconnues ignorées ; les secrets sont acceptés en clair côté client
 * (le serveur les chiffre avant stockage).
 *
 * SÉMANTIQUE DES CHAMPS SENSIBLES (systemPrompt, mcpConfig,
 * notificationChannels) :
 *   - propriété ABSENTE  → `undefined` → CONSERVER la valeur existante
 *   - propriété à `null` → EFFACER explicitement
 *
 * Cette distinction est indispensable : la SPA ne peut pas lire un champ
 * chiffré (elle n'a pas la clé). Sans elle, tout enregistrement depuis
 * l'éditeur de nœud écrasait le secret par null — y compris quand
 * l'utilisateur n'avait pas touché au champ.
 */
export interface NodeMutationBody {
    id: string;
    type: NodeType;
    nom: string;
    roleTitre: string;
    parentID?: string | null;
    gradeId: string;
    systemPrompt?: string | null | undefined;
    skills?: string[];
    mcpConfig?: McpConfig | null | undefined;
    notificationChannels?: NotificationChannels | null | undefined;
    avatarUrl?: string | null;
    /**
     * Jeton de version de la ligne telle que le client l'a chargée
     * (`hybrid_nodes.updated_at`). Fourni ⇒ verrou optimiste : la mise à jour
     * est refusée si la ligne a changé depuis. Absent ⇒ création, ou import
     * qui assume l'écrasement.
     */
    expectedUpdatedAt?: string;
}

const NODE_TYPES = new Set<string>(['HUMAN', 'AGENT_IA', 'SOFTWARE_MCP']);

export class NodeMutationValidationError extends Error {
    constructor(public readonly field: string, message: string) {
        super(message);
        this.name = 'NodeMutationValidationError';
    }
}

/** Valide et normalise un corps de mutation de nœud. Lève si invalide. */
export function validateNodeMutation(raw: unknown): NodeMutationBody {
    if (typeof raw !== 'object' || raw === null) {
        throw new NodeMutationValidationError('body', 'Corps de requête invalide');
    }
    const b = raw as Record<string, unknown>;

    if (typeof b['id'] !== 'string' || b['id'].length === 0 || b['id'].length > 256) {
        throw new NodeMutationValidationError('id', 'id invalide (string 1-256)');
    }
    if (typeof b['type'] !== 'string' || !NODE_TYPES.has(b['type'])) {
        throw new NodeMutationValidationError('type', 'type invalide (HUMAN|AGENT_IA|SOFTWARE_MCP)');
    }
    if (typeof b['nom'] !== 'string' || b['nom'].length === 0 || b['nom'].length > 256) {
        throw new NodeMutationValidationError('nom', 'nom invalide (string 1-256)');
    }
    if (typeof b['roleTitre'] !== 'string' || b['roleTitre'].length > 256) {
        throw new NodeMutationValidationError('roleTitre', 'roleTitre invalide (string max 256)');
    }
    if (typeof b['gradeId'] !== 'string' || b['gradeId'].length === 0 || b['gradeId'].length > 64) {
        throw new NodeMutationValidationError('gradeId', 'gradeId invalide (string 1-64)');
    }
    if (b['systemPrompt'] != null && (typeof b['systemPrompt'] !== 'string' || b['systemPrompt'].length > 32_000)) {
        throw new NodeMutationValidationError('systemPrompt', 'systemPrompt trop long (max 32 000 chars)');
    }

    return {
        id: b['id'] as string,
        type: b['type'] as NodeType,
        nom: b['nom'] as string,
        roleTitre: b['roleTitre'] as string,
        parentID: typeof b['parentID'] === 'string' ? b['parentID'] : null,
        gradeId: b['gradeId'] as string,
        // Champs sensibles : absent ⇒ undefined (conserver). Présent mais
        // malformé ⇒ null (effacer), comportement historique conservé.
        systemPrompt: 'systemPrompt' in b
            ? (typeof b['systemPrompt'] === 'string' ? b['systemPrompt'] : null)
            : undefined,
        skills: Array.isArray(b['skills']) ? (b['skills'] as string[]).filter((s) => typeof s === 'string') : [],
        // Jeton de version : accepté seulement s'il ressemble à une date. Une
        // valeur farfelue vaut mieux ignorée que passée telle quelle au SQL.
        ...(typeof b['expectedUpdatedAt'] === 'string'
            && !Number.isNaN(Date.parse(b['expectedUpdatedAt'] as string))
            ? { expectedUpdatedAt: b['expectedUpdatedAt'] as string }
            : {}),
        mcpConfig: 'mcpConfig' in b ? (isMcpConfig(b['mcpConfig']) ? b['mcpConfig'] : null) : undefined,
        notificationChannels: 'notificationChannels' in b
            ? (isNotifChannels(b['notificationChannels']) ? b['notificationChannels'] : null)
            : undefined,
        avatarUrl: typeof b['avatarUrl'] === 'string' ? b['avatarUrl'] : null,
    };
}

function isMcpConfig(v: unknown): v is McpConfig {
    return (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>)['serverUrl'] === 'string' &&
        Array.isArray((v as Record<string, unknown>)['connectedTo'])
    );
}

function isNotifChannels(v: unknown): v is NotificationChannels {
    if (typeof v !== 'object' || v === null) return false;
    const r = v as Record<string, unknown>;
    return (
        (r['slackWebhook'] == null || typeof r['slackWebhook'] === 'string') &&
        (r['email'] == null || typeof r['email'] === 'string') &&
        (r['whatsappId'] == null || typeof r['whatsappId'] === 'string')
    );
}

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
    /** Jeton de version, à renvoyer tel quel au prochain enregistrement. */
    updatedAt?: string;
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
        ...(node.updatedAt ? { updatedAt: node.updatedAt } : {}),
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
