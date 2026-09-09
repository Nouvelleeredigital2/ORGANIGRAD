/** Personal credentials are never used to authenticate these human management routes. */
export interface PrivateTokenMetadata {
    id: string; name: string; prefix: string; expiresAt: number; createdAt: string; revokedAt: string | null;
}
export interface IssuedPrivateToken {
    id: string; token: string; workspace: string; projectId: string; scopes: ['projects:read']; expiresAt: number;
}
export interface PrivateTokenPage { tokens: PrivateTokenMetadata[]; nextCursor?: string }
interface Scope {
    accessToken: string; workspaceId: string; projectId: string;
    isCurrent: () => boolean; signal?: AbortSignal;
}
export const PRIVATE_PROJECT_ERROR = 'Accès Synapse indisponible. Vérifiez votre session et réessayez.';
const failure = () => new Error(PRIVATE_PROJECT_ERROR);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const seconds = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 253402300799;
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure();
    return value as Record<string, unknown>;
}
function apiBase(): string {
    // Existing deployment setting (.env.example / docs/synchronisation-livraison.md).
    // Do not trust the legacy freely editable localStorage orchestrator URL for human JWTs.
    const raw = import.meta.env.VITE_ORCHESTRATOR_URL;
    if (!raw || typeof raw !== 'string') throw failure();
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !['/', '/api', '/api/'].includes(url.pathname)) throw failure();
    return `${url.origin}/api/private-projects/tokens`;
}
function metadata(value: unknown): PrivateTokenMetadata {
    const row = object(value);
    if (!uuid(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80 ||
        typeof row.prefix !== 'string' || !/^ogp_[0-9a-f]{8}$/.test(row.prefix) || !seconds(row.expiresAt) ||
        !timestamp(row.createdAt) || (row.revokedAt !== null && !timestamp(row.revokedAt))) throw failure();
    // Explicit projection prevents unexpected secrets from entering React list state.
    return { id: row.id, name: row.name, prefix: row.prefix, expiresAt: row.expiresAt, createdAt: row.createdAt, revokedAt: row.revokedAt };
}

export function createPrivateProjectTokens(scope: Scope) {
    let attempted = false;
    const current = () => {
        if (!scope.isCurrent() || scope.signal?.aborted) throw failure();
    };
    async function request<T>(method: string, suffix: string, status: number, decode: (value: unknown) => T, body?: object): Promise<T> {
        const controller = new AbortController();
        const abort = () => controller.abort();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort: (() => void) | undefined;
        try {
            current();
            if (!uuid(scope.workspaceId) || !uuid(scope.projectId) || scope.accessToken.length > 8192 ||
                !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(scope.accessToken)) throw failure();
            const url = apiBase() + suffix;
            scope.signal?.addEventListener('abort', abort, { once: true });
            // Race includes JSON reading: an unresponsive body cannot hold the UI open forever.
            const stopped = new Promise<never>((_resolve, reject) => {
                onAbort = () => reject(failure());
                controller.signal.addEventListener('abort', onAbort, { once: true });
                timer = setTimeout(abort, 10_000);
            });
            const operation = async () => {
                const response = await fetch(url, {
                    method, redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
                    headers: { Authorization: `Bearer ${scope.accessToken}`, 'X-Workspace-Id': scope.workspaceId,
                        Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
                    ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal,
                });
                current();
                if (controller.signal.aborted || response.redirected || response.status !== status) throw failure();
                const value: unknown = status === 204 ? undefined : await response.json();
                current();
                if (controller.signal.aborted) throw failure();
                return decode(value);
            };
            return await Promise.race([operation(), stopped]);
        } catch { throw failure(); }
        finally {
            clearTimeout(timer);
            scope.signal?.removeEventListener('abort', abort);
            if (onAbort) controller.signal.removeEventListener('abort', onAbort);
        }
    }
    return {
        async list(cursor?: string): Promise<PrivateTokenPage> {
            if (cursor !== undefined && !uuid(cursor)) throw failure();
            const query = `?projectId=${scope.projectId}${cursor ? `&cursor=${cursor}` : ''}`;
            return request('GET', query, 200, value => {
                const page = object(value);
                if (!Array.isArray(page.tokens) || page.tokens.length > 100 ||
                    (page.nextCursor !== undefined && !uuid(page.nextCursor))) throw failure();
                const tokens = page.tokens.map(metadata);
                if (new Set(tokens.map(row => row.id)).size !== tokens.length ||
                    (page.nextCursor !== undefined && (page.nextCursor === cursor || page.nextCursor !== tokens.at(-1)?.id))) throw failure();
                return { tokens, ...(page.nextCursor ? { nextCursor: page.nextCursor as string } : {}) };
            });
        },
        async create(name: string, expiresAt: number): Promise<IssuedPrivateToken> {
            if (attempted || !name.trim() || name.length > 80 || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
                !seconds(expiresAt) || expiresAt <= Date.now() / 1000) throw failure();
            attempted = true; // Synchronous lock; no retry of an uncertain, non-idempotent POST.
            return request('POST', '', 201, value => {
                const row = object(value);
                if (!uuid(row.id) || typeof row.token !== 'string' || !/^ogp_[0-9a-f]{64}$/.test(row.token) ||
                    row.workspace !== scope.workspaceId || row.projectId !== scope.projectId ||
                    !Array.isArray(row.scopes) || row.scopes.length !== 1 || row.scopes[0] !== 'projects:read' ||
                    !seconds(row.expiresAt) || row.expiresAt > expiresAt || row.expiresAt <= Date.now() / 1000) throw failure();
                return { id: row.id, token: row.token, workspace: scope.workspaceId, projectId: scope.projectId, scopes: ['projects:read'], expiresAt: row.expiresAt };
            }, { projectId: scope.projectId, name: name.trim(), expiresAt });
        },
        async revoke(id: string): Promise<void> {
            if (!uuid(id)) throw failure();
            return request('DELETE', `/${id}`, 204, () => undefined);
        },
    };
}
