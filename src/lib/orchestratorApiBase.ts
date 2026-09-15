/** Deployment configuration only; never accepts an editable browser destination. */
export function orchestratorApiBase(raw: unknown): string {
    if (raw === '/api' && import.meta.env.DEV && typeof location !== 'undefined' &&
        location.hostname === '127.0.0.1' && location.protocol === 'http:') {
        return `${location.origin}/api`;
    }
    if (typeof raw !== 'string' || !raw) throw new Error('Invalid orchestrator origin');
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !['/', '/api', '/api/'].includes(url.pathname)) throw new Error('Invalid orchestrator origin');
    return `${url.origin}/api`;
}
