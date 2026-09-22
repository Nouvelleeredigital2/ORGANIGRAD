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
    updated_at?: string;
    type: NodeType;
    nom: string;
    roleTitre: string;
    parentID?: string | null;
    gradeId: string;
    systemPrompt?: string | null | undefined;
    // Même sémantique que les champs sensibles ci-dessous : ABSENT ⇒ conserver
    // l'existant. Avant ce correctif, `skills` valait toujours `[]` quand omis
    // (dto.ts ne distinguait pas « absent » de « tableau vide »), donc TOUT PUT
    // qui ne renvoyait pas `skills` effaçait les compétences existantes — de
    // même pour `avatarUrl`, toujours ramené à `null` quand omis. Audit P2.
    skills?: string[] | undefined;
    mcpConfig?: McpConfig | null | undefined;
    notificationChannels?: NotificationChannels | null | undefined;
    avatarUrl?: string | null | undefined;
}

const NODE_TYPES = new Set<string>(['HUMAN', 'AGENT_IA', 'SOFTWARE_MCP']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (typeof b['id'] !== 'string' || b['id'].length === 0 || b['id'].length > 256 || !UUID_PATTERN.test(b['id'])) {
        throw new NodeMutationValidationError('id', 'id invalide (UUID)');
    }
    if ('updated_at' in b && (typeof b['updated_at'] !== 'string' || Number.isNaN(Date.parse(b['updated_at'])))) {
        throw new NodeMutationValidationError('updated_at', 'updated_at invalide (date ISO)');
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
        ...(typeof b['updated_at'] === 'string' ? { updated_at: b['updated_at'] } : {}),
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
        skills: 'skills' in b
            ? (Array.isArray(b['skills']) ? (b['skills'] as string[]).filter((s) => typeof s === 'string') : [])
            : undefined,
        mcpConfig: 'mcpConfig' in b ? (isMcpConfig(b['mcpConfig']) ? b['mcpConfig'] : null) : undefined,
        notificationChannels: 'notificationChannels' in b ? sanitizeNotifChannels(b['notificationChannels']) : undefined,
        avatarUrl: 'avatarUrl' in b
            ? (typeof b['avatarUrl'] === 'string' ? b['avatarUrl'] : null)
            : undefined,
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

function sanitizeNotifChannels(v: unknown): NotificationChannels | null {
    if (typeof v !== 'object' || v === null) return null;
    const r = v as Record<string, unknown>;
    const normalized: NotificationChannels = {};
    if (typeof r['slackWebhook'] === 'string') normalized.slackWebhook = r['slackWebhook'];
    if (typeof r['email'] === 'string') normalized.email = r['email'];
    if (typeof r['telegram'] === 'string') normalized.telegram = r['telegram'];
    return Object.keys(normalized).length > 0 ? normalized : null;
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
    updated_at?: string;
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
    notifications: { slack: boolean; email: boolean };
}

export function toPublicNodeDTO(node: HybridNode): PublicNodeDTO {
    const nc = node.notificationChannels;
    return {
        id: node.id,
        updated_at: node.updated_at,
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
        },
    };
}
