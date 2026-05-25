import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    Notifier,
    buildValidationBlocks,
    buildFluxBlocks,
    postWithRetry,
    type AuditLogger,
    type NotificationAuditEntry,
} from '../src/observability/notifier.js';
import { GraphStore } from '../src/state/graphStore.js';
import type { HybridNode } from '../src/domain/types.js';

// Helpers pour accéder aux arguments des appels fetch de manière typée
function callBody(mock: ReturnType<typeof vi.fn>, callIndex = 0): unknown {
    const raw = mock.mock.calls[callIndex]?.[1]?.body as string | undefined;
    return raw ? (JSON.parse(raw) as unknown) : undefined;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HUMAN: HybridNode = {
    id: 'hum',
    type: 'HUMAN',
    nom: 'Camille',
    roleTitre: 'DirMarketing',
    parentID: null,
    gradeId: 'D',
    notificationChannels: {
        slackWebhook: 'https://hooks.slack.com/services/T/CV',
        email: 'c@x.fr',
    },
    status: 'IDLE',
};

const AGENT: HybridNode = {
    id: 'ia',
    type: 'AGENT_IA',
    nom: 'Rédacteur',
    roleTitre: 'r',
    parentID: null,
    gradeId: 'E',
    status: 'IDLE',
};

function makeStore() {
    const store = new GraphStore();
    store.load([HUMAN, AGENT]);
    return store;
}

function makeFetch(status = 200) {
    return vi.fn().mockResolvedValue(new Response('', { status }));
}

function makeAudit(): { logger: AuditLogger; rows: NotificationAuditEntry[] } {
    const rows: NotificationAuditEntry[] = [];
    const logger: AuditLogger = {
        insert: vi.fn(async (entry) => {
            rows.push(entry);
        }),
    };
    return { logger, rows };
}

// ─── Tests comportement de routage (contrat originel, inchangé) ────────────────

describe('Notifier — routage', () => {
    let store: GraphStore;
    let fetchMock: ReturnType<typeof vi.fn>;
    let notifier: Notifier;

    beforeEach(() => {
        store = makeStore();
        fetchMock = makeFetch();
        notifier = new Notifier({
            store,
            fetchImpl: fetchMock as typeof fetch,
            validationsWebhook: 'https://hooks.slack.com/validations',
            fluxWebhook: 'https://hooks.slack.com/flux',
        });
        notifier.attach();
    });

    it('une transition vers WAITING_HUMAN_APPROVAL poste sur #validations + canaux personnels', async () => {
        store.applyTransition('hum', 'EXECUTING');
        fetchMock.mockClear();
        store.applyTransition('hum', 'WAITING_HUMAN_APPROVAL');

        await new Promise((r) => setImmediate(r));

        const urls = fetchMock.mock.calls.map((c) => c[0] as string);
        expect(urls).toContain('https://hooks.slack.com/validations');
        expect(urls).toContain('https://hooks.slack.com/services/T/CV');
    });

    it('une transition non-WAITING poste UNIQUEMENT sur #flux-agents', async () => {
        fetchMock.mockClear();
        store.applyTransition('ia', 'EXECUTING');
        await new Promise((r) => setImmediate(r));

        const urls = fetchMock.mock.calls.map((c) => c[0] as string);
        expect(urls).toEqual(['https://hooks.slack.com/flux']);
    });

    it('aucun listener entrant — le notifier n\'expose pas d\'API d\'écoute', () => {
        const proto = Object.getPrototypeOf(notifier) as Record<string, unknown>;
        const methods = Object.getOwnPropertyNames(proto).filter(
            (m) => m !== 'constructor' && typeof (notifier as never)[m] === 'function',
        );
        for (const m of methods) {
            expect(m).not.toMatch(/^(on|listen|subscribe|receive)/i);
        }
    });

    it('detach() arrête d\'émettre', async () => {
        notifier.detach();
        fetchMock.mockClear();
        store.applyTransition('ia', 'EXECUTING');
        await new Promise((r) => setImmediate(r));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('un échec webhook n\'interrompt pas le store', async () => {
        fetchMock.mockRejectedValueOnce(new Error('boom'));
        expect(() => store.applyTransition('ia', 'EXECUTING')).not.toThrow();
        await new Promise((r) => setImmediate(r));
    });
});

// ─── Tests Block Kit ──────────────────────────────────────────────────────────

describe('Block Kit — buildValidationBlocks', () => {
    it('retourne un tableau de blocs non vide', () => {
        const blocks = buildValidationBlocks('n1', 'Alice', 'DGA', 'EXECUTING', 'WAITING_HUMAN_APPROVAL');
        expect(Array.isArray(blocks)).toBe(true);
        expect(blocks.length).toBeGreaterThanOrEqual(2);
    });

    it('contient un bloc header avec le bon titre', () => {
        const blocks = buildValidationBlocks('n1', 'Alice', 'DGA', 'EXECUTING', 'WAITING_HUMAN_APPROVAL');
        const header = blocks[0] as { type: string; text: { text: string } };
        expect(header.type).toBe('header');
        expect(header.text.text).toContain('Validation requise');
    });

    it('les fields contiennent le nom du nœud et la transition', () => {
        const blocks = buildValidationBlocks('n1', 'Alice', 'DGA', 'EXECUTING', 'WAITING_HUMAN_APPROVAL');
        const section = blocks[1] as { fields: Array<{ text: string }> };
        const texts = section.fields.map((f) => f.text);
        expect(texts.some((t) => t.includes('Alice'))).toBe(true);
        expect(texts.some((t) => t.includes('EXECUTING'))).toBe(true);
    });

    it('inclut un bouton "actions" quand appUrl est fourni', () => {
        const blocks = buildValidationBlocks(
            'n1', 'Alice', 'DGA', 'EXECUTING', 'WAITING_HUMAN_APPROVAL',
            'https://organigrad.app',
        );
        const hasActions = blocks.some((b) => (b as { type: string }).type === 'actions');
        expect(hasActions).toBe(true);
    });

    it('n\'inclut PAS de bouton "actions" sans appUrl', () => {
        const blocks = buildValidationBlocks('n1', 'Alice', 'DGA', 'EXECUTING', 'WAITING_HUMAN_APPROVAL');
        const hasActions = blocks.some((b) => (b as { type: string }).type === 'actions');
        expect(hasActions).toBe(false);
    });
});

describe('Block Kit — buildFluxBlocks', () => {
    it('retourne 2 blocs (section + context)', () => {
        const blocks = buildFluxBlocks('n2', 'Bot', 'Rédacteur', 'IDLE', 'EXECUTING');
        expect(blocks).toHaveLength(2);
    });

    it('inclut l\'emoji de statut pour EXECUTING', () => {
        const blocks = buildFluxBlocks('n2', 'Bot', 'Rédacteur', 'IDLE', 'EXECUTING');
        const section = blocks[0] as { text: { text: string } };
        expect(section.text.text).toContain('🔄');
    });

    it('inclut l\'emoji d\'erreur quand error est fourni', () => {
        const blocks = buildFluxBlocks('n2', 'Bot', 'Rédacteur', 'EXECUTING', 'ERROR', 'timeout');
        const section = blocks[0] as { text: { text: string } };
        expect(section.text.text).toContain('⚠️');
        expect(section.text.text).toContain('timeout');
    });
});

// ─── Tests payload envoyé : les blocs sont bien dans le body ──────────────────

describe('Notifier — payload Block Kit transmis à fetch', () => {
    it('le body envoyé contient un champ `blocks` (tableau)', async () => {
        const store = makeStore();
        const fetchMock = makeFetch();
        const notifier = new Notifier({
            store,
            fetchImpl: fetchMock as typeof fetch,
            fluxWebhook: 'https://hooks.slack.com/flux',
        });
        notifier.attach();

        store.applyTransition('ia', 'EXECUTING');
        await new Promise((r) => setImmediate(r));

        const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
        expect(typeof rawBody).toBe('string');
        const body = JSON.parse(rawBody as string) as {
            blocks: unknown[];
            text: string;
        };
        expect(Array.isArray(body.blocks)).toBe(true);
        expect(body.blocks.length).toBeGreaterThan(0);
        // Fallback text toujours présent pour clients Slack legacy
        expect(typeof body.text).toBe('string');
    });

    it('le bloc HITL contient les 4 fields attendus (nom, rôle, transition, id)', async () => {
        const store = makeStore();
        const fetchMock = makeFetch();
        const notifier = new Notifier({
            store,
            fetchImpl: fetchMock as typeof fetch,
            validationsWebhook: 'https://hooks.slack.com/validations',
        });
        notifier.attach();

        store.applyTransition('hum', 'EXECUTING');
        fetchMock.mockClear();
        store.applyTransition('hum', 'WAITING_HUMAN_APPROVAL');
        await new Promise((r) => setImmediate(r));

        const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
        expect(typeof rawBody).toBe('string');
        const body = JSON.parse(rawBody as string) as {
            blocks: Array<{ type: string; fields?: Array<{ text: string }> }>;
        };
        const section = body.blocks.find((b) => b.type === 'section');
        expect(section?.fields).toHaveLength(4);
    });
});

// ─── Tests retry 5xx ─────────────────────────────────────────────────────────

describe('postWithRetry', () => {
    it('réussit dès le 1er appel si 200', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 200 }));
        const res = await postWithRetry(fetchMock as typeof fetch, 'https://example.com', {});
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('réessaie sur 503 et réussit au 2e coup', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(new Response('', { status: 200 }));

        const res = await postWithRetry(fetchMock as typeof fetch, 'https://example.com', {});
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throw si les 2 tentatives échouent (network error)', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        await expect(
            postWithRetry(fetchMock as typeof fetch, 'https://example.com', {}),
        ).rejects.toThrow('ECONNREFUSED');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('renvoie 4xx sans retry (erreur client, pas serveur)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
        const res = await postWithRetry(fetchMock as typeof fetch, 'https://example.com', {});
        expect(res.status).toBe(404);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

// ─── Tests AuditLogger ───────────────────────────────────────────────────────

describe('Notifier — audit trail', () => {
    it('insère une entrée "sent" dans l\'AuditLogger après un envoi réussi', async () => {
        const store = makeStore();
        const { logger, rows } = makeAudit();
        const notifier = new Notifier({
            store,
            fetchImpl: makeFetch(200) as typeof fetch,
            fluxWebhook: 'https://hooks.slack.com/flux',
            auditLogger: logger,
        });
        notifier.attach();

        store.applyTransition('ia', 'EXECUTING');
        await new Promise((r) => setImmediate(r));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.status).toBe('sent');
        expect(rows[0]!.channel).toBe('slack_webhook');
        expect(rows[0]!.target).toBe('https://hooks.slack.com/flux');
        expect(rows[0]!.error).toBeNull();
        expect(rows[0]!.sent_at).not.toBeNull();
    });

    it('insère une entrée "failed" si le webhook est injoignable', async () => {
        const store = makeStore();
        const { logger, rows } = makeAudit();
        const fetchFail = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        const notifier = new Notifier({
            store,
            fetchImpl: fetchFail as typeof fetch,
            fluxWebhook: 'https://hooks.slack.com/flux',
            auditLogger: logger,
        });
        notifier.attach();

        store.applyTransition('ia', 'EXECUTING');
        await new Promise((r) => setImmediate(r));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.status).toBe('failed');
        expect(rows[0]!.error).toContain('ECONNREFUSED');
        expect(rows[0]!.sent_at).toBeNull();
    });

    it('insère 2 entrées pour WAITING_HUMAN_APPROVAL (#validations + canal perso)', async () => {
        const store = makeStore();
        const { logger, rows } = makeAudit();
        const notifier = new Notifier({
            store,
            fetchImpl: makeFetch(200) as typeof fetch,
            validationsWebhook: 'https://hooks.slack.com/validations',
            auditLogger: logger,
        });
        notifier.attach();

        store.applyTransition('hum', 'EXECUTING');
        await new Promise((r) => setImmediate(r));
        rows.length = 0; // reset après EXECUTING

        store.applyTransition('hum', 'WAITING_HUMAN_APPROVAL');
        await new Promise((r) => setImmediate(r));

        expect(rows).toHaveLength(2);
        const targets = rows.map((r) => r!.target);
        expect(targets).toContain('https://hooks.slack.com/validations');
        expect(targets).toContain('https://hooks.slack.com/services/T/CV');
    });

    it('une erreur d\'audit DB ne propage pas au store ni au caller', async () => {
        const store = makeStore();
        const brokenLogger: AuditLogger = {
            insert: vi.fn().mockRejectedValue(new Error('DB down')),
        };
        const notifier = new Notifier({
            store,
            fetchImpl: makeFetch(200) as typeof fetch,
            fluxWebhook: 'https://hooks.slack.com/flux',
            auditLogger: brokenLogger,
        });
        notifier.attach();

        expect(() => store.applyTransition('ia', 'EXECUTING')).not.toThrow();
        await new Promise((r) => setImmediate(r));
        // Si on arrive ici sans crash, le test est bon
    });

    it('n\'appelle pas l\'auditLogger si non configuré', async () => {
        const store = makeStore();
        const { logger, rows } = makeAudit();
        const notifier = new Notifier({
            store,
            fetchImpl: makeFetch(200) as typeof fetch,
            fluxWebhook: 'https://hooks.slack.com/flux',
            // auditLogger intentionnellement absent
        });
        notifier.attach();

        store.applyTransition('ia', 'EXECUTING');
        await new Promise((r) => setImmediate(r));

        expect(rows).toHaveLength(0);
        expect((logger.insert as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });
});

// ─── Tests transport email ────────────────────────────────────────────────────

describe('Notifier — transport email', () => {
    const EMAIL_URL = 'https://abc.supabase.co/functions/v1/notify-email';
    const SERVICE_KEY = 'service_role_key_xxx';

    it('appelle l\'Edge Function pour WAITING_HUMAN_APPROVAL si email configuré', async () => {
        const store = makeStore();
        const fetchMock = makeFetch(200);
        const notifier = new Notifier({
            store,
            fetchImpl: fetchMock as typeof fetch,
            emailEdgeFunctionUrl: EMAIL_URL,
            supabaseServiceRoleKey: SERVICE_KEY,
        });
        notifier.attach();

        store.applyTransition('hum', 'EXECUTING');
        fetchMock.mockClear();
        store.applyTransition('hum', 'WAITING_HUMAN_APPROVAL');
        await new Promise((r) => setImmediate(r));

        const emailCall = fetchMock.mock.calls.find((c) => (c[0] as string) === EMAIL_URL);
        expect(emailCall).toBeDefined();
    });

    it('le payload envoyé à l\'Edge Function contient type=hitl et les champs du nœud', async () => {
        const store = makeStore();
        const fetchMock = makeFetch(200);
        const notifier = new Notifier({
            store,
            fetchImpl: fetchMock as typeof fetch,
            emailEdgeFunctionUrl: EMAIL_URL,
        });
        notifier.attach();

        store.applyTransition('hum', 'EXECUTING');
        fetchMock.mockClear();
        store.applyTransition('hum', 'WAITING_HUMAN_APPROVAL');
        await new Promise((r) => setImmediate(r));

        const emailCall = fetchMock.mock.calls.find((c) => (c[0] as string) === EMAIL_URL);
        expect(emailCall).toBeDefined();
        const body = JSON.parse(emailCall![1].body as string) as {
            type: string;
            to: string;
            data: { nodeName: string; toStatus: string };
        };
        expect(body.type).toBe('hitl');
        expect(body.to).toBe('c@x.fr'); // notificationChannels.email du HUMAN
        expect(body.data.nodeName).toBe('Camille');
        expect(body.data.toStatus).toBe('WAITING_HUMAN_APPROVAL');
    });

    it('n\'appelle PAS l\'Edge Function pour EXECUTING (pas HITL, pas ERROR)', async () => {
        const store = makeStore();
        const fetchMock = makeFetch(200);
        const notifier = new Notifier({
            store,
            fetchImpl: fetchMock as typeof fetch,
            emailEdgeFunctionUrl: EMAIL_URL,
        });
        notifier.attach();

        fetchMock.mockClear();
        store.applyTransition('ia', 'EXECUTING'); // ia n'a pas d'email + pas HITL
        await new Promise((r) => setImmediate(r));

        const emailCall = fetchMock.mock.calls.find((c) => (c[0] as string) === EMAIL_URL);
        expect(emailCall).toBeUndefined();
    });

    it('appelle l\'Edge Function pour ERROR avec type=flux', async () => {
        const store = makeStore();
        const fetchMock = makeFetch(200);
        // Créer un store avec un HUMAN ayant email + forcer ERROR via run → error
        const humanWithError: HybridNode = {
            ...HUMAN,
            id: 'hum2',
            status: 'EXECUTING', // déjà en EXECUTING pour pouvoir → ERROR
        };
        const store2 = new GraphStore();
        store2.load([humanWithError]);

        const notifier = new Notifier({
            store: store2,
            fetchImpl: fetchMock as typeof fetch,
            emailEdgeFunctionUrl: EMAIL_URL,
        });
        notifier.attach();

        store2.applyTransition('hum2', 'ERROR', { error: 'timeout MCP' });
        await new Promise((r) => setImmediate(r));

        const emailCall = fetchMock.mock.calls.find((c) => (c[0] as string) === EMAIL_URL);
        expect(emailCall).toBeDefined();
        const body = callBody(fetchMock, fetchMock.mock.calls.indexOf(emailCall!)) as {
            type: string;
            data: { error: string };
        };
        expect(body.type).toBe('flux');
        expect(body.data.error).toBe('timeout MCP');
    });

    it('n\'appelle PAS l\'Edge Function si emailEdgeFunctionUrl absent', async () => {
        const store = makeStore();
        const fetchMock = makeFetch(200);
        const notifier = new Notifier({
            store,
            fetchImpl: fetchMock as typeof fetch,
            // emailEdgeFunctionUrl intentionnellement absent
        });
        notifier.attach();

        store.applyTransition('hum', 'EXECUTING');
        fetchMock.mockClear();
        store.applyTransition('hum', 'WAITING_HUMAN_APPROVAL');
        await new Promise((r) => setImmediate(r));

        // fetch peut être appelé pour le Slack personnel, mais jamais vers EMAIL_URL
        const emailCall = fetchMock.mock.calls.find((c) => (c[0] as string) === EMAIL_URL);
        expect(emailCall).toBeUndefined();
    });

    it('un échec de l\'Edge Function ne remonte pas au store', async () => {
        const store = makeStore();
        const fetchFail = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
        const notifier = new Notifier({
            store,
            fetchImpl: fetchFail as typeof fetch,
            emailEdgeFunctionUrl: EMAIL_URL,
        });
        notifier.attach();

        store.applyTransition('hum', 'EXECUTING');
        expect(() =>
            store.applyTransition('hum', 'WAITING_HUMAN_APPROVAL'),
        ).not.toThrow();
        await new Promise((r) => setImmediate(r));
    });
});
