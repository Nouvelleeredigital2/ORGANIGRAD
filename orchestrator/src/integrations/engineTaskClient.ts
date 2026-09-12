/**
 * Isolated adapter for ned-media-engine /api/v1, based on its local jobs,
 * engines and jobService contracts. No scheduler, credential discovery,
 * image download or deployment is performed here.
 *
 * The caller must qualify the live origin and persist the attempt before
 * submitOnce. Memory deduplication alone does not survive a process restart.
 */
export type EngineJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface EngineJobState { jobId: string; status: EngineJobStatus }
export interface EngineSubmittedJob extends EngineJobState { pipeline: string[] }
export interface EngineArtifactReference { fileId: string; role: string; type: string; downloadUrl: string }
export interface EngineImageInput { engineId: string; prompt: string }
export function validEngineImageInput(input: EngineImageInput): boolean {
    return !!input && typeof input.engineId === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(input.engineId)
        && input.engineId !== 'automatic' && typeof input.prompt === 'string'
        && !!input.prompt.trim() && input.prompt.length <= 2000;
}
export type EngineTaskErrorCode = 'INVALID_CONFIG' | 'INVALID_INPUT' | 'ATTEMPT_CONFLICT' | 'ENGINE_UNAVAILABLE' | 'ENGINE_UNREACHABLE' | 'ENGINE_REJECTED' | 'INVALID_RESPONSE' | 'DELIVERY_UNCERTAIN';

export class EngineTaskError extends Error {
    readonly retryable = false;
    constructor(readonly code: EngineTaskErrorCode) {
        super(`Engine: ${code}`);
        this.name = 'EngineTaskError';
    }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[a-z][a-z0-9-]{0,63}$/;
const statuses: readonly string[] = ['queued', 'running', 'completed', 'failed', 'cancelled'];
const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EngineTaskError('INVALID_RESPONSE');
    return value as Record<string, unknown>;
};
const jobState = (value: unknown, expected?: string): EngineJobState => {
    const item = record(value);
    if (typeof item.jobId !== 'string' || !uuid.test(item.jobId) || (expected && item.jobId !== expected) || typeof item.status !== 'string' || !statuses.includes(item.status)) throw new EngineTaskError('INVALID_RESPONSE');
    return { jobId: item.jobId, status: item.status as EngineJobStatus };
};

export function createEngineTaskClient(config: {
    baseUrl: string;
    /** Exact origin verified by deployment qualification, never user input. */
    qualifiedOrigin: string;
    apiKey: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}) {
    let origin: string;
    try {
        const url = new URL(config.baseUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.origin !== config.qualifiedOrigin) throw new Error();
        origin = url.origin;
    } catch { throw new EngineTaskError('INVALID_CONFIG'); }
    const timeoutMs = config.timeoutMs ?? 10_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || typeof config.apiKey !== 'string' || !config.apiKey.trim() || /[\r\n]/.test(config.apiKey)) throw new EngineTaskError('INVALID_CONFIG');
    const apiKey = config.apiKey;
    const fetcher = config.fetchImpl ?? globalThis.fetch;
    const attempts = new Map<string, { fingerprint: string; result: Promise<EngineSubmittedJob> }>();

    async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
        const uncertain = () => new EngineTaskError(method === 'POST' ? 'DELIVERY_UNCERTAIN' : 'ENGINE_UNREACHABLE');
        let response: Response;
        try {
            response = await fetcher(origin + path, {
                method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
                headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
        } catch { throw uncertain(); }
        if (!response.ok) {
            if (method === 'POST' && (response.status >= 500 || response.status === 408 || response.status === 429 || response.status < 400)) throw uncertain();
            throw new EngineTaskError('ENGINE_REJECTED');
        }
        try {
            if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') || !response.body) throw new Error();
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let length = 0;
            try {
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    length += chunk.value.byteLength;
                    if (length > 512_000) { await reader.cancel(); throw new Error(); }
                    chunks.push(chunk.value);
                }
            } finally { reader.releaseLock(); }
            return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
        } catch { throw new EngineTaskError(method === 'POST' ? 'DELIVERY_UNCERTAIN' : 'INVALID_RESPONSE'); }
    }

    async function listEngines(): Promise<Array<{ id: string; status: string; tasks: string[]; enabled: boolean }>> {
        const payload = record(await request('GET', '/api/v1/engines'));
        if (!Array.isArray(payload.engines) || payload.engines.length > 100) throw new EngineTaskError('INVALID_RESPONSE');
        const result = payload.engines.map(value => {
            const engine = record(value);
            if (typeof engine.id !== 'string' || !identifier.test(engine.id) || typeof engine.status !== 'string' || !['available', 'unavailable', 'loading', 'disabled'].includes(engine.status) || typeof engine.enabled !== 'boolean' || !Array.isArray(engine.tasks) || !engine.tasks.every(task => typeof task === 'string' && identifier.test(task))) throw new EngineTaskError('INVALID_RESPONSE');
            return { id: engine.id, status: engine.status, tasks: engine.tasks as string[], enabled: engine.enabled };
        });
        if (new Set(result.map(item => item.id)).size !== result.length) throw new EngineTaskError('INVALID_RESPONSE');
        return result;
    }

    async function checkAvailability(input: EngineImageInput): Promise<void> {
        const selected = (await listEngines()).find(engine => engine.id === input.engineId);
        if (!selected || !selected.enabled || selected.status !== 'available' || !selected.tasks.includes('generate-image')) throw new EngineTaskError('ENGINE_UNAVAILABLE');
    }
    async function submit(input: EngineImageInput): Promise<EngineSubmittedJob> {
        const response = await request('POST', '/api/v1/jobs', { taskType: 'generate-image', engine: input.engineId, prompt: input.prompt });
        try {
            const state = jobState(response);
            const pipeline = record(response).pipeline;
            if (!Array.isArray(pipeline) || pipeline.length !== 1 || pipeline[0] !== input.engineId) throw new Error();
            return { ...state, pipeline: [input.engineId] };
        } catch { throw new EngineTaskError('DELIVERY_UNCERTAIN'); }
    }

    function once(submissionId:string,input:EngineImageInput,operation:()=>Promise<EngineSubmittedJob>):Promise<EngineSubmittedJob> {
            if (typeof submissionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(submissionId) || !validEngineImageInput(input)) throw new EngineTaskError('INVALID_INPUT');
            const fingerprint = JSON.stringify([input.engineId, input.prompt]);
            const previous = attempts.get(submissionId);
            if (previous) {
                if (previous.fingerprint !== fingerprint) throw new EngineTaskError('ATTEMPT_CONFLICT');
                return previous.result;
            }
            const result = operation();
            attempts.set(submissionId, { fingerprint, result });
            return result;
    }
    return {
        get qualifiedOrigin() { return origin; },
        listEngines,
        /** Read-only preflight before the durable dispatch marker. The returned
         * operation captures this origin and exact input and performs only POST. */
        async prepareImage(input:EngineImageInput):Promise<(submissionId:string)=>Promise<EngineSubmittedJob>> {
            if(!validEngineImageInput(input))throw new EngineTaskError('INVALID_INPUT');
            const snapshot={engineId:input.engineId,prompt:input.prompt};
            await checkAvailability(snapshot);
            return submissionId=>once(submissionId,snapshot,()=>submit(snapshot));
        },
        async submitOnce(submissionId: string, input: EngineImageInput): Promise<EngineSubmittedJob> {
            if(!validEngineImageInput(input))throw new EngineTaskError('INVALID_INPUT');
            const snapshot={engineId:input.engineId,prompt:input.prompt};
            return once(submissionId,snapshot,async()=>{await checkAvailability(snapshot);return submit(snapshot);});
        },
        async getJob(jobId: string): Promise<EngineJobState> {
            if (!uuid.test(jobId)) throw new EngineTaskError('INVALID_INPUT');
            return jobState(await request('GET', `/api/v1/jobs/${jobId}`), jobId);
        },
        async getResults(jobId: string): Promise<EngineJobState & { results: EngineArtifactReference[] }> {
            if (!uuid.test(jobId)) throw new EngineTaskError('INVALID_INPUT');
            const response = record(await request('GET', `/api/v1/jobs/${jobId}/results`));
            const state = jobState(response, jobId);
            if (!Array.isArray(response.results) || response.results.length > 100) throw new EngineTaskError('INVALID_RESPONSE');
            const results = response.results.map(value => {
                const item = record(value);
                if (typeof item.fileId !== 'string' || !uuid.test(item.fileId) || typeof item.role !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(item.role) || typeof item.type !== 'string' || !/^image\/[a-z0-9.+-]+$/.test(item.type) || item.downloadUrl !== `/api/v1/files/${item.fileId}`) throw new EngineTaskError('INVALID_RESPONSE');
                return { fileId: item.fileId, role: item.role, type: item.type, downloadUrl: new URL(item.downloadUrl, origin).href };
            });
            return { ...state, results };
        },
    };
}
