import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Adaptateur isolé de la route service d'Atelier Orvion
 * (POST /api/editorial/service/commands, PR ATELIER_ORVION#107). Sans JWT : le mandat
 * opaque porté par le corps est le seul secret, il n'apparaît jamais dans une erreur
 * ni un journal. Une seule méthode, un seul POST par appel ; toute réponse non
 * vérifiable est DELIVERY_UNCERTAIN (l'effet a peut-être eu lieu), jamais un rejet.
 */
export const orvionOperations = ['watch:create', 'article:create', 'brief:create', 'review:create', 'version:create', 'image:attach'] as const;
export type OrvionOperation = typeof orvionOperations[number];
export const orvionArtifactKinds = ['watch', 'subject', 'brief', 'article', 'visual_prompt', 'image', 'review'] as const;
export type OrvionArtifactKind = typeof orvionArtifactKinds[number];
export interface OrvionProjectRef { sourceApp: string; workspaceId: string; projectId: string; canonicalUrl: string }
export interface OrvionCommandPayload { dossierId: string; content: string; sources?: string[]; expectedVersion?: number; kind?: OrvionArtifactKind }
export interface OrvionCommandInput { operation: OrvionOperation; project: OrvionProjectRef; boardId: string; idempotencyKey: string; payload: OrvionCommandPayload }
export interface OrvionDeliverable {
    sourceApp: 'atelier-orvion'; objectType: 'editorial_version'; id: string; kind: OrvionArtifactKind; version: number;
    dossierId: string; boardId: string; replayed: boolean; canonicalUrl: string;
}
export type OrvionServiceErrorCode = 'INVALID_CONFIG' | 'INVALID_INPUT' | 'DELIVERY_UNCERTAIN' | 'ORVION_REJECTED';
export class OrvionServiceError extends Error {
    constructor(readonly code: OrvionServiceErrorCode, readonly httpStatus?: number, readonly orvionCode?: string) {
        super(`Orvion: ${code}`); this.name = 'OrvionServiceError';
    }
}

const uuid = z.string().uuid();
const RESPONSE_LIMIT = 64 * 1024;
const commandSchema = z.object({
    operation: z.enum(orvionOperations),
    project: z.object({ sourceApp: z.string().min(1).max(128), workspaceId: z.string().min(1).max(128), projectId: z.string().min(1).max(128), canonicalUrl: z.string().url().max(2048) }).strict(),
    boardId: uuid, idempotencyKey: uuid,
    payload: z.object({ dossierId: uuid, content: z.string().min(1).max(200000), sources: z.array(z.string().max(4096)).max(100).optional(), expectedVersion: z.number().int().min(0).optional(), kind: z.enum(orvionArtifactKinds).optional() }).strict(),
}).strict();
const rejection = z.object({ success: z.literal(false), error: z.object({ code: z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/) }).passthrough() }).passthrough();

/** Lit le mandat Orvion depuis un fichier (jamais une variable journalisée) ; n'expose que le nom du fichier. */
export function readOrvionMandateFile(path: string): string {
    let value: string;
    try { value = readFileSync(path, 'utf8').trim(); } catch { throw new OrvionServiceError('INVALID_CONFIG'); }
    if (!uuid.safeParse(value).success) throw new OrvionServiceError('INVALID_CONFIG');
    return value.toLowerCase();
}

export function createOrvionServiceClient(config: {
    baseUrl: string;
    /** Origine exacte qualifiée au déploiement, jamais une saisie utilisateur. */
    qualifiedOrigin: string;
    /** Mandat de service opaque, lu au démarrage ; jamais rendu. */
    mandateId: string;
    /** Origine autorisée par la protection CSRF d'Orvion (celle d'APP_URL). */
    originHeader: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}) {
    let origin: string;
    try {
        const url = new URL(config.baseUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.origin !== config.qualifiedOrigin) throw new Error();
        const header = new URL(config.originHeader);
        if (header.protocol !== 'https:' || header.origin !== config.originHeader) throw new Error();
        origin = url.origin;
    } catch { throw new OrvionServiceError('INVALID_CONFIG'); }
    const timeoutMs = config.timeoutMs ?? 10_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || !uuid.safeParse(config.mandateId).success) throw new OrvionServiceError('INVALID_CONFIG');
    const mandateId = config.mandateId;
    const originHeader = config.originHeader;
    const fetcher = config.fetchImpl ?? globalThis.fetch;
    const deliverable = z.object({
        success: z.literal(true),
        data: z.object({
            sourceApp: z.literal('atelier-orvion'), objectType: z.literal('editorial_version'), id: uuid, kind: z.enum(orvionArtifactKinds),
            version: z.number().int().positive(), dossierId: uuid, boardId: uuid, replayed: z.boolean(),
            canonicalUrl: z.string().max(2048).refine(value => { try { const u = new URL(value); return u.protocol === 'https:' && u.origin === origin && !u.username && !u.password; } catch { return false; } }),
        }).strict(),
        message: z.string().max(1000).optional(),
    }).strict();

    async function readBounded(response: Response): Promise<unknown> {
        if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) throw new Error();
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                length += chunk.value.byteLength;
                if (length > RESPONSE_LIMIT) { await reader.cancel(); throw new Error(); }
                chunks.push(chunk.value);
            }
        } finally { reader.releaseLock(); }
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    }

    return {
        get qualifiedOrigin() { return origin; },
        /** UN SEUL POST ; l'appelant doit avoir réservé un reçu durable avant. */
        async command(input: OrvionCommandInput): Promise<OrvionDeliverable> {
            const parsed = commandSchema.safeParse(input);
            if (!parsed.success) throw new OrvionServiceError('INVALID_INPUT');
            const { operation, project, boardId, idempotencyKey, payload } = parsed.data;
            const body = JSON.stringify({ operation, mandateId, project, boardId, idempotencyKey, payload });
            let response: Response;
            try {
                response = await fetcher(origin + '/api/editorial/service/commands', {
                    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
                    headers: { Origin: originHeader, Accept: 'application/json', 'Content-Type': 'application/json' }, body,
                });
            } catch { throw new OrvionServiceError('DELIVERY_UNCERTAIN'); }
            if (response.status !== 200) {
                if (response.status >= 500 || response.status === 408 || response.status === 429 || response.status < 400) throw new OrvionServiceError('DELIVERY_UNCERTAIN', response.status);
                // Refus définitif : aucun effet n'a eu lieu, le code Orvion est relayé sans le corps.
                let code: string | undefined;
                try { const parsedRejection = rejection.safeParse(await readBounded(response)); if (parsedRejection.success) code = parsedRejection.data.error.code; } catch { /* refus sans corps exploitable */ }
                throw new OrvionServiceError('ORVION_REJECTED', response.status, code);
            }
            let raw: unknown;
            try { raw = await readBounded(response); } catch { throw new OrvionServiceError('DELIVERY_UNCERTAIN', 200); }
            const verified = deliverable.safeParse(raw);
            if (!verified.success || verified.data.data.boardId !== boardId || verified.data.data.dossierId !== payload.dossierId) throw new OrvionServiceError('DELIVERY_UNCERTAIN', 200);
            return verified.data.data;
        },
    };
}
export type OrvionServiceClient = ReturnType<typeof createOrvionServiceClient>;
