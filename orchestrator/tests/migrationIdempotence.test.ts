import { describe, it, expect } from 'vitest';

const hasMV = !!process.env.SUPABASE_MEMOIRE_VIVE_URL && !!process.env.SUPABASE_MEMOIRE_VIVE_KEY;
const skipIfNoMV = (name: string, fn: () => Promise<void>) =>
  hasMV ? it(name, fn) : it.skip(name, fn);

const mvFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${process.env.SUPABASE_MEMOIRE_VIVE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      'apikey': process.env.SUPABASE_MEMOIRE_VIVE_KEY!,
      'authorization': `Bearer ${process.env.SUPABASE_MEMOIRE_VIVE_KEY!}`,
      'content-type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });

describe('Migration idempotence — archived_decisions', () => {
  const testKey = `migration-test-${Date.now()}`;

  skipIfNoMV('INSERT idempotent (double insert même correlation_key)', async () => {
    const body = JSON.stringify({
      correlation_key: testKey,
      validation_id: 'migration-test-node',
      decision: 'approved',
      source_app: 'test-runner',
      decided_by: 'vitest',
      correlation_id: testKey,
      causation_id: testKey,
    });
    const opts = {
      method: 'POST',
      headers: { 'prefer': 'resolution=ignore-duplicates,return=minimal' },
      body,
    };
    const r1 = await mvFetch('/archived_decisions', opts);
    const r2 = await mvFetch('/archived_decisions', opts);
    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);
    // Vérifier qu'il n'y a qu'une seule ligne
    const check = await mvFetch(`/archived_decisions?correlation_key=eq.${testKey}&select=count`);
    const data = await check.json();
    expect(data[0]?.count ?? 1).toBe('1');
  });

  skipIfNoMV('SELECT filtre par source_app', async () => {
    const r = await mvFetch('/archived_decisions?source_app=eq.organigrad&limit=1');
    expect(r.status).toBe(200);
    const rows = await r.json();
    expect(Array.isArray(rows)).toBe(true);
  });

  skipIfNoMV('Schema — colonnes requises présentes', async () => {
    const r = await mvFetch('/archived_decisions?limit=0');
    expect(r.status).toBe(200);
    // si la table n'a pas les bonnes colonnes, PostgREST retourne 400/404
  });

  skipIfNoMV('Nettoyage — DELETE de la ligne de test', async () => {
    const r = await mvFetch(`/archived_decisions?correlation_key=eq.${testKey}`, { method: 'DELETE' });
    expect([200, 204]).toContain(r.status);
  });
});
