import { describe, it, expect, vi } from 'vitest';
import {
    assertUrlAllowed,
    isForbiddenIp,
    isForbiddenIpv4,
    safeFetch,
    SsrfError,
    type SafeFetchDeps,
} from '../src/net/ssrfGuard.js';

/** Politique « production » pour les tests : https + pas d'IP privée. */
const PROD = { allowHttp: true, allowPrivate: false } as const;

/** Faux resolver DNS : map hostname → adresses. */
function fakeLookup(map: Record<string, string[]>): SafeFetchDeps['lookup'] {
    return async (host: string) => {
        const addrs = map[host];
        if (!addrs) throw new Error('ENOTFOUND');
        return addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    };
}

describe('classification des IP', () => {
    it('IPv4 interdites', () => {
        for (const ip of [
            '127.0.0.1',
            '10.0.0.5',
            '172.16.0.1',
            '172.31.255.255',
            '192.168.1.1',
            '169.254.169.254', // métadonnées cloud
            '100.64.0.1', // CGNAT
            '0.0.0.0',
            '224.0.0.1',
        ]) {
            expect(isForbiddenIpv4(ip), ip).toBe(true);
        }
    });

    it('IPv4 publiques autorisées', () => {
        for (const ip of ['93.184.216.34', '1.1.1.1', '8.8.8.8']) {
            expect(isForbiddenIpv4(ip), ip).toBe(false);
        }
    });

    it('IPv6 loopback / link-local / ULA / mappé interdites', () => {
        for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
            expect(isForbiddenIp(ip), ip).toBe(true);
        }
        expect(isForbiddenIp('2606:4700:4700::1111')).toBe(false); // Cloudflare DNS public
    });
});

describe('assertUrlAllowed', () => {
    it('refuse localhost (résout vers 127.0.0.1)', async () => {
        await expect(
            assertUrlAllowed('http://localhost/x', PROD, { lookup: fakeLookup({ localhost: ['127.0.0.1'] }) }),
        ).rejects.toBeInstanceOf(SsrfError);
    });

    it('refuse un hostname résolvant vers une IP privée', async () => {
        await expect(
            assertUrlAllowed('https://intra.example/x', PROD, {
                lookup: fakeLookup({ 'intra.example': ['10.1.2.3'] }),
            }),
        ).rejects.toBeInstanceOf(SsrfError);
    });

    it('refuse une IP de métadonnées en littéral', async () => {
        await expect(assertUrlAllowed('http://169.254.169.254/latest/meta-data', PROD)).rejects.toBeInstanceOf(
            SsrfError,
        );
    });

    it('refuse ::1 littéral', async () => {
        await expect(assertUrlAllowed('http://[::1]:8080/x', PROD)).rejects.toBeInstanceOf(SsrfError);
    });

    it('autorise une cible publique en https', async () => {
        await expect(
            assertUrlAllowed('https://api.example.com/x', PROD, {
                lookup: fakeLookup({ 'api.example.com': ['93.184.216.34'] }),
            }),
        ).resolves.toBeUndefined();
    });

    it('refuse un protocole non http(s)', async () => {
        await expect(assertUrlAllowed('ftp://example.com/x', PROD)).rejects.toBeInstanceOf(SsrfError);
    });

    it('refuse http quand allowHttp=false (production)', async () => {
        await expect(
            assertUrlAllowed('http://api.example.com/x', { allowHttp: false, allowPrivate: false }),
        ).rejects.toBeInstanceOf(SsrfError);
    });

    it('allowlist : refuse hors liste, autorise dans la liste', async () => {
        const lookup = fakeLookup({ 'api.example.com': ['93.184.216.34'], 'evil.com': ['93.184.216.34'] });
        await expect(
            assertUrlAllowed('https://evil.com/x', { ...PROD, allowlist: ['api.example.com'] }, { lookup }),
        ).rejects.toBeInstanceOf(SsrfError);
        await expect(
            assertUrlAllowed('https://api.example.com/x', { ...PROD, allowlist: ['api.example.com'] }, { lookup }),
        ).resolves.toBeUndefined();
    });

    it('en dev (allowPrivate par défaut) localhost est autorisé', async () => {
        await expect(
            assertUrlAllowed('http://localhost:3001/mcp', { allowHttp: true, allowPrivate: true }),
        ).resolves.toBeUndefined();
    });
});

describe('safeFetch', () => {
    const lookup = fakeLookup({ 'api.example.com': ['93.184.216.34'], 'evil.com': ['93.184.216.34'] });

    it('refuse une redirection vers une IP privée (revalidation)', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
        );
        await expect(
            safeFetch('https://api.example.com/x', {}, PROD, { fetchImpl: fetchImpl as typeof fetch, lookup }),
        ).rejects.toBeInstanceOf(SsrfError);
    });

    it('refuse une réponse trop volumineuse (content-length)', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response('x', { status: 200, headers: { 'content-length': '999999999' } }),
        );
        await expect(
            safeFetch('https://api.example.com/x', {}, { ...PROD, maxResponseBytes: 1000 }, {
                fetchImpl: fetchImpl as typeof fetch,
                lookup,
            }),
        ).rejects.toBeInstanceOf(SsrfError);
    });

    it('renvoie le corps quand tout est conforme', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
        const res = await safeFetch('https://api.example.com/x', {}, PROD, {
            fetchImpl: fetchImpl as typeof fetch,
            lookup,
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });

    it('applique un timeout (abort → SsrfError)', async () => {
        const fetchImpl = vi.fn().mockImplementation(
            (_url: string, init: RequestInit) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
                }),
        );
        await expect(
            safeFetch('https://api.example.com/x', {}, { ...PROD, timeoutMs: 10 }, {
                fetchImpl: fetchImpl as typeof fetch,
                lookup,
            }),
        ).rejects.toMatchObject({ reason: 'timeout' });
    });

    it('refuse d\'emblée une cible interdite (pas d\'appel réseau)', async () => {
        const fetchImpl = vi.fn();
        await expect(
            safeFetch('http://169.254.169.254/', {}, PROD, { fetchImpl: fetchImpl as typeof fetch, lookup }),
        ).rejects.toBeInstanceOf(SsrfError);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
