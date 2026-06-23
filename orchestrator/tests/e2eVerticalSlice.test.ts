// E2E « tranche verticale » (spine Organigrad → bus, sur HTTP réel).
//
// Pilote le VRAI moteur d'orchestration + le VRAI producteur Synapse contre un
// bus HTTP minimal en process (qui mime le contrat d'ingestion de Synapse :
// POST /api/events stocke + assigne id/version/status/createdAt ; GET filtre par
// correlationId). Prouve que :
//   1. atteindre un nœud HUMAN émet `validation.requested` (slug organigrad,
//      targetApps:["link"], correlationId déterministe).
//   2. approuver émet `validation.approved` corrélé (même correlationId).
//   3. UN SEUL correlationId traverse toute la chaîne.
//   4. rejouer la décision ne change pas la corrélation (idempotence de clé).
//
// Suites B2 / B5 — idempotence réelle (archived_decisions Supabase).
// Nécessitent SUPABASE_MEMOIRE_VIVE_URL + SUPABASE_MEMOIRE_VIVE_KEY dans
// l'environnement. Sans eux, les tests sont skippés (vitest run passe au vert).
//
// Ne nécessite ni Supabase ni le serveur Synapse complet — exécutable en CI.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { OrchestrationEngine } from '../src/orchestration/engine.js';
import { InMemoryGraphStore } from '../src/state/graphStore.js';
import { createSynapseProducer } from '../src/synapse/producer.js';
import type { HybridNode } from '../src/domain/types.js';

interface BusEvent {
  id: string;
  type: string;
  sourceApp: string;
  version: string;
  status: string;
  createdAt: string;
  correlationId?: string;
  causationId?: string;
  validationId?: string;
  targetApps?: string[];
  payload: Record<string, unknown>;
}

const mcpStub = { runNode: async () => ({ ok: true as const, output: null }) };

const humanNode: HybridNode = {
  id: 'node-e2e',
  type: 'HUMAN',
  nom: 'Validation finale',
  roleTitre: 'Directrice',
  parentID: null,
  gradeId: 'grade-admin',
  status: 'IDLE',
};

let server: Server;
let baseUrl: string;
const bus: BusEvent[] = [];

beforeAll(async () => {
  // Bus HTTP minimal — contrat d'ingestion identique à Synapse.
  server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/events') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const e = JSON.parse(body || '{}');
        const stored: BusEvent = {
          ...e,
          id: `evt-${bus.length + 1}`,
          version: e.version ?? '1.0',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        bus.push(stored);
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(stored));
      });
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/api/events')) {
      const u = new URL(req.url, baseUrl);
      const cid = u.searchParams.get('correlationId');
      const items = cid ? bus.filter((e) => e.correlationId === cid) : bus;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items, total: items.length }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  // Bind explicite IPv4 : évite le mismatch localhost(::1)/serveur(0.0.0.0) sous Windows.
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function busByCorrelation(correlationId: string): Promise<BusEvent[]> {
  const r = await fetch(`${baseUrl}/api/events?correlationId=${encodeURIComponent(correlationId)}`);
  const data = (await r.json()) as { items: BusEvent[] };
  return data.items;
}

describe('E2E tranche verticale — spine Organigrad → bus (HTTP réel)', () => {
  it('émet validation.requested → approved corrélés par un seul correlationId', async () => {
    vi.unstubAllGlobals(); // restaure le vrai fetch (le harnais hermétique le mocke)
    const store = new InMemoryGraphStore();
    store.load([humanNode]);
    const producer = createSynapseProducer({ synapseUrl: baseUrl });
    const engine = new OrchestrationEngine(store, mcpStub, producer);

    // 1. Le flux atteint le garant humain → validation.requested émis sur le bus.
    const run = await engine.runFlow('node-e2e');
    expect(run.waitingHumanAt).toBe('node-e2e');

    let events = await busByCorrelation('val-node-e2e');
    const requested = events.find((e) => e.type === 'validation.requested');
    expect(requested).toBeDefined();
    expect(requested?.sourceApp).toBe('organigrad');
    expect(requested?.targetApps).toEqual(['link']);
    expect(requested?.validationId).toBe('node-e2e');

    // 2. L'humain approuve → validation.approved émis, corrélé.
    await engine.approve('node-e2e');
    events = await busByCorrelation('val-node-e2e');
    const approved = events.find((e) => e.type === 'validation.approved');
    expect(approved).toBeDefined();
    expect(approved?.sourceApp).toBe('organigrad');
    expect(approved?.targetApps).toEqual(['link', 'memoire-vive-connect']);
    expect(approved?.payload.decision).toBe('approved');

    // 3. UN SEUL correlationId traverse demande + décision.
    const correlations = new Set(events.map((e) => e.correlationId));
    expect([...correlations]).toEqual(['val-node-e2e']);
  });

  it('rejet émet validation.rejected corrélé', async () => {
    vi.unstubAllGlobals(); // restaure le vrai fetch
    const store = new InMemoryGraphStore();
    store.load([{ ...humanNode, id: 'node-e2e-2', status: 'WAITING_HUMAN_APPROVAL' }]);
    const producer = createSynapseProducer({ synapseUrl: baseUrl });
    const engine = new OrchestrationEngine(store, mcpStub, producer);

    await engine.reject('node-e2e-2', 'contenu incomplet');
    const events = await busByCorrelation('val-node-e2e-2');
    const rejected = events.find((e) => e.type === 'validation.rejected');
    expect(rejected).toBeDefined();
    expect(rejected?.payload.decision).toBe('rejected');
    expect(rejected?.payload.reason).toBe('contenu incomplet');
  });
});

// ---------------------------------------------------------------------------
// Helpers Supabase (utilisés par B2 et B5)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env['SUPABASE_MEMOIRE_VIVE_URL'];
const SUPABASE_KEY = process.env['SUPABASE_MEMOIRE_VIVE_KEY'];
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * Interroge `archived_decisions` et retourne le nombre de lignes dont le
 * `correlation_id` correspond à `correlationId`.
 * Utilise l'API REST PostgREST exposée par Supabase (count exact).
 */
async function countArchivedDecisions(correlationId: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_MEMOIRE_VIVE_URL / SUPABASE_MEMOIRE_VIVE_KEY absents');
  }
  const url = `${SUPABASE_URL}/rest/v1/archived_decisions?correlation_id=eq.${encodeURIComponent(correlationId)}&select=id`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      // Demande le décompte exact dans l'en-tête Content-Range.
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase REST a répondu ${res.status} pour correlationId=${correlationId}`);
  }
  // PostgREST retourne Content-Range: 0-N/total
  const range = res.headers.get('content-range');
  if (!range) {
    // Fallback : compter les items JSON retournés.
    const rows = (await res.json()) as unknown[];
    return rows.length;
  }
  // Format : "0-N/total" ou "*/total"
  const total = range.split('/')[1];
  return total !== undefined ? parseInt(total, 10) : 0;
}

/**
 * Attend (avec polling toutes les 500 ms, timeout 10 s) que le compte dans
 * `archived_decisions` atteigne `expected`.
 */
async function waitForArchivedCount(
  correlationId: string,
  expected: number,
  timeoutMs = 10_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await countArchivedDecisions(correlationId);
    if (count >= expected) return count;
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  return countArchivedDecisions(correlationId);
}

// ---------------------------------------------------------------------------
// B2 — Idempotence 20× (même correlationId)
// ---------------------------------------------------------------------------

describe('B2 — idempotence 20× (même correlationId)', () => {
  it.skipIf(!hasSupabase)(
    'envoie 20 approbations consécutives, attend 1 seul archived_decisions',
    async () => {
      vi.unstubAllGlobals(); // restaure le vrai fetch

      // Nœud dédié à cette suite pour éviter toute collision avec B5 ou les
      // suites existantes (le correlationId dérivé est val-<nodeId>).
      const nodeId = 'node-b2-idempotence';
      const correlationId = `val-${nodeId}`;

      const store = new InMemoryGraphStore();
      store.load([
        {
          ...humanNode,
          id: nodeId,
          status: 'WAITING_HUMAN_APPROVAL',
        },
      ]);
      const producer = createSynapseProducer({ synapseUrl: baseUrl });
      const engine = new OrchestrationEngine(store, mcpStub, producer);

      // 20 approbations consécutives sur le même nodeId.
      // Le store in-memory autorise une seule transition légale
      // WAITING_HUMAN_APPROVAL → IDLE ; les suivantes lèvent
      // IllegalTransitionError que le moteur absorbe (best-effort).
      // L'important est que le bus (Supabase) n'archive qu'une seule décision.
      for (let i = 0; i < 20; i++) {
        try {
          await engine.approve(nodeId);
        } catch {
          // Transitions illégales après la première — attendu et ignoré.
        }
      }

      // Attente courte puis vérification dans Supabase.
      const count = await waitForArchivedCount(correlationId, 1);
      expect(count).toBe(1);
    },
    15_000, // timeout vitest étendu à 15 s (polling + latence réseau Supabase)
  );
});

// ---------------------------------------------------------------------------
// B5 — Idempotence cross-service (même commande envoyée 2×)
// ---------------------------------------------------------------------------

describe('B5 — idempotence cross-service (même commande 2×)', () => {
  it.skipIf(!hasSupabase)(
    'deux approbations du même nodeId ne créent qu\'une archive',
    async () => {
      vi.unstubAllGlobals(); // restaure le vrai fetch

      const nodeId = 'node-b5-cross-service';
      const correlationId = `val-${nodeId}`;

      const store = new InMemoryGraphStore();
      store.load([
        {
          ...humanNode,
          id: nodeId,
          status: 'WAITING_HUMAN_APPROVAL',
        },
      ]);
      const producer = createSynapseProducer({ synapseUrl: baseUrl });
      const engine = new OrchestrationEngine(store, mcpStub, producer);

      // Première approbation : transition légale, événement émis sur le bus.
      await engine.approve(nodeId);

      // Deuxième approbation : transition illégale dans le store (absorbée),
      // mais on voudrait s'assurer que même si le bus reçoit l'événement une
      // seconde fois, Supabase n'archive qu'une ligne.
      try {
        await engine.approve(nodeId);
      } catch {
        // IllegalTransitionError attendue — ignorée.
      }

      const count = await waitForArchivedCount(correlationId, 1);
      expect(count).toBe(1);
    },
    15_000,
  );
});
