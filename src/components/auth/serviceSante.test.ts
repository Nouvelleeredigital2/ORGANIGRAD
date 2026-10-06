import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sonderServiceAuth } from './serviceSante';

/**
 * Sonde `/auth/v1/health` : seule une réponse 5xx ou l'absence de réponse
 * signalent une panne. Un 4xx prouve que le service répond.
 */

const fetchSimule = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://exemple.supabase.co/');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'cle-anonyme-de-test');
    fetchSimule.mockReset();
    vi.stubGlobal('fetch', fetchSimule);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('sonderServiceAuth', () => {
    it('réponse 401 : service disponible', async () => {
        fetchSimule.mockResolvedValue(new Response(null, { status: 401 }));

        await expect(sonderServiceAuth()).resolves.toBe(true);
        expect(fetchSimule).toHaveBeenCalledWith(
            'https://exemple.supabase.co/auth/v1/health',
            expect.objectContaining({ headers: { apikey: 'cle-anonyme-de-test' } }),
        );
    });

    it('réponse 503 : service indisponible', async () => {
        fetchSimule.mockResolvedValue(new Response(null, { status: 503 }));

        await expect(sonderServiceAuth()).resolves.toBe(false);
    });

    it('exception réseau : service indisponible', async () => {
        fetchSimule.mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(sonderServiceAuth()).resolves.toBe(false);
    });

    it('sans AbortSignal.timeout (Safari < 16) : pas de faux diagnostic de panne', async () => {
        const original = AbortSignal.timeout;
        // @ts-expect-error -- simule un navigateur qui ne fournit pas la méthode
        delete AbortSignal.timeout;
        try {
            fetchSimule.mockResolvedValue(new Response(null, { status: 200 }));
            await expect(sonderServiceAuth()).resolves.toBe(true);
        } finally {
            AbortSignal.timeout = original;
        }
    });
});
