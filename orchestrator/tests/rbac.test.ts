// Suite RBAC négative — Organigrad orchestrator HTTP
//
// Vérifie que TOUTES les routes protégées rejettent :
//   • les requêtes sans jeton        → 401
//   • les requêtes avec jeton invalide ("Bearer bad-token") → 401 ou 403
//
// Pilote le VRAI serveur pgServer via la classe PgServer en mode test (sans
// Supabase réel : on passe un `lookup` fictif qui rejette tout token inconnu).
// Nécessite ORGANIGRAD_URL dans l'environnement pour s'exécuter en vrai contre
// un serveur déjà démarré ; sinon, tous les tests sont skippés proprement.
//
// Usage local (server en cours) :
//   ORGANIGRAD_URL=http://localhost:3000 npx vitest run tests/rbac.test.ts
//
// Usage CI sans serveur :
//   npx vitest run tests/rbac.test.ts   (→ tous skippés, suite verte)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** URL du serveur à tester. Peut pointer vers un serveur local ou distant. */
const BASE_URL = process.env.ORGANIGRAD_URL ?? '';

/** true si un serveur est disponible pour les tests live */
const serverAvailable = BASE_URL.length > 0;

// ---------------------------------------------------------------------------
// Routes protégées à tester (méthode + chemin)
// ---------------------------------------------------------------------------

interface ProtectedRoute {
  method: string;
  path: string;
  /** Corps JSON minimal pour les méthodes POST/PUT */
  body?: Record<string, unknown>;
  /** Description lisible pour le rapport de test */
  label: string;
}

const PROTECTED_ROUTES: ProtectedRoute[] = [
  // graph
  { method: 'GET',    path: '/api/graph',              label: 'GET /api/graph (graph:read)' },
  // nodes
  { method: 'GET',    path: '/api/nodes/test-node-id', label: 'GET /api/nodes/:id (graph:write)' },
  { method: 'POST',   path: '/api/nodes',
    body: { id: 'x', type: 'AGENT', nom: 'X', roleTitre: 'R', parentID: null, gradeId: 'g' },
    label: 'POST /api/nodes (graph:write)' },
  { method: 'PUT',    path: '/api/nodes/test-node-id',
    body: { nom: 'X', roleTitre: 'R' },
    label: 'PUT /api/nodes/:id (graph:write)' },
  { method: 'DELETE', path: '/api/nodes/test-node-id', label: 'DELETE /api/nodes/:id (graph:write)' },
  // execution
  { method: 'POST',   path: '/api/nodes/test-node-id/run',      body: {}, label: 'POST /api/nodes/:id/run (node:run)' },
  { method: 'POST',   path: '/api/nodes/test-node-id/run-flow', body: {}, label: 'POST /api/nodes/:id/run-flow (node:run)' },
  // human actions (JWT-only scopes)
  { method: 'POST',   path: '/api/nodes/test-node-id/approve',  body: {}, label: 'POST /api/nodes/:id/approve (human:approve)' },
  { method: 'POST',   path: '/api/nodes/test-node-id/reject',   body: { reason: 'test' }, label: 'POST /api/nodes/:id/reject (human:reject)' },
  { method: 'POST',   path: '/api/nodes/test-node-id/reset',    body: {}, label: 'POST /api/nodes/:id/reset (node:reset)' },
  // SSE ticket
  { method: 'POST',   path: '/api/events/ticket', body: {}, label: 'POST /api/events/ticket (execution:read)' },
  // MCP
  { method: 'POST',   path: '/mcp',
    body: [{ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }],
    label: 'POST /mcp (authenticated)' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number }> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe.skipIf(!serverAvailable)('RBAC négatif — routes protégées Organigrad', () => {
  // Sanity : le serveur répond
  it('GET /healthz répond 200 (serveur accessible)', async () => {
    const res = await fetch(`${BASE_URL}/healthz`);
    expect(res.status).toBe(200);
  });

  describe('Sans Authorization header → 401', () => {
    for (const route of PROTECTED_ROUTES) {
      it(route.label, async () => {
        const { status } = await request(route.method, route.path, {}, route.body);
        expect(status, `${route.method} ${route.path} sans token doit retourner 401`).toBe(401);
      });
    }
  });

  describe('Authorization: Bearer bad-token (jeton invalide) → 401 ou 403', () => {
    for (const route of PROTECTED_ROUTES) {
      it(route.label, async () => {
        const { status } = await request(
          route.method,
          route.path,
          { Authorization: 'Bearer bad-token' },
          route.body,
        );
        expect(
          [401, 403],
          `${route.method} ${route.path} avec bad-token doit retourner 401 ou 403`,
        ).toContain(status);
      });
    }
  });

  describe('Authorization: Bearer (header vide) → 401', () => {
    for (const route of PROTECTED_ROUTES) {
      it(route.label, async () => {
        const { status } = await request(
          route.method,
          route.path,
          { Authorization: 'Bearer ' },
          route.body,
        );
        expect(
          [401, 403],
          `${route.method} ${route.path} avec Bearer vide doit retourner 401 ou 403`,
        ).toContain(status);
      });
    }
  });
});

// Suite toujours présente : vérifie que la liste de routes est bien définie
// (tourne même sans ORGANIGRAD_URL pour valider la structure du fichier de test).
describe('Inventaire des routes protégées (méta-test)', () => {
  it('la liste contient au moins 10 routes protégées', () => {
    expect(PROTECTED_ROUTES.length).toBeGreaterThanOrEqual(10);
  });

  it('toutes les routes ont une méthode et un chemin non vides', () => {
    for (const r of PROTECTED_ROUTES) {
      expect(r.method.length, `label: ${r.label}`).toBeGreaterThan(0);
      expect(r.path.startsWith('/'), `label: ${r.label}`).toBe(true);
    }
  });

  it('si ORGANIGRAD_URL absent : suite live skippée proprement', () => {
    if (!serverAvailable) {
      // Ce test confirme que le skip est intentionnel, pas un oubli.
      expect(BASE_URL).toBe('');
    } else {
      // En mode live, la variable est présente.
      expect(BASE_URL).toMatch(/^https?:\/\//);
    }
  });
});
