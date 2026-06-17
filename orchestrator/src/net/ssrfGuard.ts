import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Protection SSRF (Priorité 4).
 *
 * Les URLs MCP et les webhooks sont configurables par l'utilisateur : sans
 * garde-fou, l'orchestrateur pourrait être détourné pour atteindre des cibles
 * internes (métadonnées cloud `169.254.169.254`, services privés, localhost…).
 *
 * `safeFetch` :
 *   1. n'autorise que http(s) (https seul en production) ;
 *   2. résout le DNS AVANT la requête et vérifie TOUTES les IP retournées ;
 *   3. refuse loopback, IP privées/link-local/CGNAT, multicast, réservées,
 *      IPv6 ULA/link-local, et l'IPv4-mappé en IPv6 ;
 *   4. suit les redirections MANUELLEMENT en revalidant chaque cible ;
 *   5. applique un timeout, une taille de réponse maximale et une limite de
 *      redirections ;
 *   6. supporte une allowlist d'hôtes configurable ;
 *   7. ne renvoie jamais au client les détails réseau internes (message générique).
 */

export class SsrfError extends Error {
    constructor(public readonly reason: string) {
        // Message générique côté client — pas de détail réseau interne.
        super('URL refusée par la politique de sécurité réseau');
        this.name = 'SsrfError';
    }
}

export interface SsrfPolicy {
    /** Autorise http:// (sinon https uniquement). Défaut : true hors production. */
    allowHttp?: boolean;
    /** Autorise les cibles privées/loopback (dev local). Défaut : true hors production. */
    allowPrivate?: boolean;
    /** Allowlist d'hôtes (hostnames exacts). Si non vide, l'hôte DOIT y figurer. */
    allowlist?: string[];
    maxRedirects?: number;
    timeoutMs?: number;
    maxResponseBytes?: number;
}

export interface SafeFetchDeps {
    fetchImpl?: typeof fetch;
    /** Résolution DNS injectable (tests). Renvoie une ou plusieurs adresses. */
    lookup?: (hostname: string) => Promise<{ address: string; family: number }[]>;
}

function isProd(): boolean {
    return process.env.NODE_ENV === 'production';
}

function resolvePolicy(p: SsrfPolicy = {}): Required<Omit<SsrfPolicy, 'allowlist'>> & {
    allowlist: string[];
} {
    return {
        allowHttp: p.allowHttp ?? !isProd(),
        allowPrivate: p.allowPrivate ?? !isProd(),
        allowlist: p.allowlist ?? [],
        maxRedirects: p.maxRedirects ?? 3,
        timeoutMs: p.timeoutMs ?? 10_000,
        maxResponseBytes: p.maxResponseBytes ?? 1_000_000,
    };
}

// ── Classification des IP ──────────────────────────────────────────────────

/** IPv4 interdite : loopback, privée, link-local (métadonnées), CGNAT, etc. */
export function isForbiddenIpv4(ip: string): boolean {
    const o = ip.split('.').map((n) => Number(n));
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = o as [number, number, number, number];
    if (a === 0) return true; // 0.0.0.0/8 (inclut 0.0.0.0)
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (métadonnées cloud)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 réservé + 255.255.255.255
    return false;
}

/** IPv6 interdite : ::1, ::, ULA fc00::/7, link-local fe80::/10, multicast ff00::/8, IPv4-mappé. */
export function isForbiddenIpv6(ip: string): boolean {
    const addr = ip.toLowerCase().split('%')[0]!; // retire un éventuel scope id
    if (addr === '::1' || addr === '::') return true;

    // IPv4-mappé (::ffff:a.b.c.d) ou NAT64 (64:ff9b::a.b.c.d) → vérifier l'IPv4.
    const mapped = addr.match(/(?:::ffff:|64:ff9b::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isForbiddenIpv4(mapped[1]!);
    // ::ffff:0:0/96 sous forme hexa — on bloque par prudence le préfixe mappé.

    const first = addr.split(':')[0] ?? '';
    const h = parseInt(first || '0', 16);
    if (Number.isNaN(h)) return true;
    if ((h & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((h & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((h & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
}

export function isForbiddenIp(ip: string): boolean {
    const fam = isIP(ip);
    if (fam === 4) return isForbiddenIpv4(ip);
    if (fam === 6) return isForbiddenIpv6(ip);
    return true; // pas une IP valide → refus
}

// ── Validation d'URL ────────────────────────────────────────────────────────

/**
 * Valide une URL selon la politique : protocole, allowlist, puis résolution DNS
 * + vérification de TOUTES les IP. Lève `SsrfError` si refusée.
 */
export async function assertUrlAllowed(
    rawUrl: string,
    policy: SsrfPolicy = {},
    deps: SafeFetchDeps = {},
): Promise<void> {
    const pol = resolvePolicy(policy);
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new SsrfError('url_invalide');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new SsrfError('protocole_non_autorisé');
    }
    if (url.protocol === 'http:' && !pol.allowHttp) {
        throw new SsrfError('http_interdit_en_production');
    }

    const host = url.hostname.replace(/^\[|\]$/g, ''); // retire les crochets IPv6
    if (pol.allowlist.length > 0 && !pol.allowlist.includes(url.hostname)) {
        throw new SsrfError('hôte_hors_allowlist');
    }

    if (pol.allowPrivate) return; // dev : pas de contrôle d'IP privée

    // Si l'hôte est déjà une IP littérale, on la vérifie directement.
    if (isIP(host)) {
        if (isForbiddenIp(host)) throw new SsrfError('ip_interdite');
        return;
    }

    // Sinon : résolution DNS et vérification de TOUTES les adresses retournées.
    const lookup = deps.lookup ?? defaultLookup;
    let addrs: { address: string; family: number }[];
    try {
        addrs = await lookup(host);
    } catch {
        throw new SsrfError('résolution_dns_échouée');
    }
    if (addrs.length === 0) throw new SsrfError('aucune_adresse');
    for (const a of addrs) {
        if (isForbiddenIp(a.address)) throw new SsrfError('résout_vers_ip_interdite');
    }
}

async function defaultLookup(hostname: string): Promise<{ address: string; family: number }[]> {
    const res = await dnsLookup(hostname, { all: true });
    return res.map((r) => ({ address: r.address, family: r.family }));
}

// ── safeFetch ─────────────────────────────────────────────────────────────

/**
 * fetch protégé contre les SSRF. Suit les redirections manuellement en
 * revalidant chaque cible, applique timeout + taille max. Renvoie une `Response`
 * dont le corps a déjà été lu et borné (réutilisable via `.json()`/`.text()`).
 */
export async function safeFetch(
    rawUrl: string,
    init: RequestInit = {},
    policy: SsrfPolicy = {},
    deps: SafeFetchDeps = {},
): Promise<Response> {
    const pol = resolvePolicy(policy);
    const fetchImpl = deps.fetchImpl ?? fetch;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), pol.timeoutMs);

    try {
        let currentUrl = rawUrl;
        for (let hop = 0; hop <= pol.maxRedirects; hop++) {
            await assertUrlAllowed(currentUrl, policy, deps);

            const res = await fetchImpl(currentUrl, {
                ...init,
                redirect: 'manual',
                signal: controller.signal,
            });

            // Redirection : on revalide la nouvelle cible (pas de suivi aveugle).
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (!location) return await capBody(res, pol.maxResponseBytes);
                if (hop === pol.maxRedirects) throw new SsrfError('trop_de_redirections');
                currentUrl = new URL(location, currentUrl).toString();
                continue;
            }

            return await capBody(res, pol.maxResponseBytes);
        }
        throw new SsrfError('trop_de_redirections');
    } catch (err) {
        if (controller.signal.aborted) throw new SsrfError('timeout');
        if (err instanceof SsrfError) throw err;
        // Erreur réseau sur une cible DÉJÀ validée (publique/autorisée) : pas de
        // fuite de topologie interne, on propage l'erreur d'origine telle quelle
        // pour que l'appelant puisse la rapporter (ex. ECONNREFUSED).
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/** Lit le corps en bornant la taille, puis renvoie une Response réutilisable. */
async function capBody(res: Response, maxBytes: number): Promise<Response> {
    const declared = res.headers.get('content-length');
    if (declared && Number(declared) > maxBytes) {
        throw new SsrfError('réponse_trop_volumineuse');
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
        throw new SsrfError('réponse_trop_volumineuse');
    }
    return new Response(buf, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
    });
}
