import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `workspaceRpcSecurity.integration.test.ts` rejoue les migrations postérieures au
// baseline avec `sql.unsafe`. Le client `postgres` refuse alors une transaction
// ouverte dans le fichier : « UNSAFE_TRANSACTION: Only use sql.begin, sql.reserved
// or max: 1 ». La suite entière tombe dans son `beforeAll` et ses 11 contrôles
// d'isolation multi-espaces passent en `skipped` — l'isolation n'est plus vérifiée,
// sans qu'aucun test ne soit rouge. C'est arrivé le 2026-09-09 (run 34352277866).
// L'atomicité reste assurée par la transaction implicite du lot multi-instructions.
const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const SCHEMA_DIR = join(import.meta.dirname, '..', '..', 'supabase', 'schema');
const transaction = /^\s*(begin|start\s+transaction|commit|rollback)\s*;/im;

// Les corps entre dollars contiennent le `begin` de PL/pgSQL, qui n'a rien d'une
// transaction. Les retirer avant de chercher, sinon le contrôle crie au loup sur
// toutes les migrations à fonctions — et une règle qui crie au loup finit ignorée.
const horsCorps = (sql: string) => sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, '');

const fichiers = (dir: string) =>
    readdirSync(dir).filter(nom => nom.endsWith('.sql')).map(nom => [nom, join(dir, nom)] as const);

describe('migrations : aucune transaction explicite', () => {
    it.each(fichiers(MIGRATIONS_DIR))('%s n’ouvre pas de transaction', (_nom, chemin) => {
        expect(horsCorps(readFileSync(chemin, 'utf8'))).not.toMatch(transaction);
    });

    it.each(fichiers(SCHEMA_DIR))('%s n’ouvre pas de transaction', (_nom, chemin) => {
        expect(horsCorps(readFileSync(chemin, 'utf8'))).not.toMatch(transaction);
    });

    it('couvre bien des fichiers, au lieu de passer sur une liste vide', () => {
        expect(fichiers(MIGRATIONS_DIR).length).toBeGreaterThan(0);
        expect(fichiers(SCHEMA_DIR).length).toBeGreaterThan(0);
    });
});
