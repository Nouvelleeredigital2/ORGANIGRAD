import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres, { type Sql } from 'postgres';

/**
 * Tests de sécurité NÉGATIFS sur les RPC administratives de workspace.
 *
 * Régression gardée : `create_workspace_api_key` et `invite_workspace_member`
 * vérifiaient `workspace_role_of(ws) NOT IN ('owner','admin')`. Pour un
 * appelant non membre du workspace visé, `workspace_role_of()` renvoie NULL et
 * `NULL NOT IN (...)` vaut NULL — `IF NULL THEN` est faux en PL/pgSQL, donc le
 * `RAISE EXCEPTION 'forbidden'` était sauté. N'importe quel utilisateur
 * authentifié pouvait créer une clé API ou inviter un membre dans N'IMPORTE
 * QUEL workspace. Corrigé par 20260812122608 (COALESCE, sûr au NULL).
 *
 * Ces tests s'exécutent contre un PostgreSQL RÉEL, sur le SQL RÉELLEMENT
 * VERSIONNÉ (baseline + migrations postérieures, cf. supabase/migrations/README.md) —
 * pas sur une copie recopiée ici, sinon la régression passerait inaperçue.
 *
 * Hermétique par défaut : ne tourne QUE si `TEST_DATABASE_URL` est défini.
 *
 * Lancer :
 *   docker run --rm -e POSTGRES_PASSWORD=test -p 15433:5432 postgres:16
 *   TEST_DATABASE_URL=postgres://postgres:test@localhost:15433/postgres \
 *     npm test -- workspaceRpcSecurity
 */

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

/** Racine du dépôt Organigrad, depuis `orchestrator/tests/`. */
const REPO = join(import.meta.dirname, '..', '..');
const SCHEMA_DIR = join(REPO, 'supabase', 'schema');
const MIGRATIONS_DIR = join(REPO, 'supabase', 'migrations');

/**
 * Les migrations antérieures au 2026-08-03 ne sont pas rejouables (une partie
 * du schéma de production a été créée hors dépôt). Le chemin de provisionnement
 * documenté est : baseline, puis uniquement les migrations postérieures.
 */
const BASELINE = 'baseline_2026-08-03.sql';
const MIGRATIONS_APRES_BASELINE = '20260803120000';

/**
 * Supabase fournit le schéma `auth` ; un PostgreSQL nu, non. On le simule au
 * strict nécessaire : `auth.uid()` / `auth.email()` lisent un GUC de session,
 * ce qui permet d'endosser l'identité d'un utilisateur dans une transaction.
 */
const SHIM_AUTH = `
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.email() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
create or replace function auth.role() returns text language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
create or replace function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
do $$ begin
    create role authenticated;   exception when duplicate_object then null; end $$;
do $$ begin
    create role anon;            exception when duplicate_object then null; end $$;
do $$ begin
    create role service_role;    exception when duplicate_object then null; end $$;
`;

describe.runIf(Boolean(TEST_DB_URL))('RPC workspace — sécurité multi-tenant', () => {
    let sql: Sql;

    // Quatre identités, deux workspaces étanches. Les workspaces ne sont pas
    // créés à la main : le trigger `on_auth_user_created` provisionne un
    // workspace personnel (+ profil + membership owner) à chaque utilisateur.
    // On s'appuie dessus plutôt que de le contourner — c'est le vrai parcours.
    const ownerA = randomUUID();   // owner de A, étranger à B
    const ownerB = randomUUID();   // owner de B, étranger à A
    const memberA = randomUUID();  // member de A
    const viewerA = randomUUID();  // viewer de A
    const TOUS = [ownerA, ownerB, memberA, viewerA];
    let wsA = '';
    let wsB = '';

    /** Exécute `fn` en endossant `uid`, dans une transaction isolée. */
    async function enTantQue<T>(uid: string, fn: (tx: Sql) => Promise<T>): Promise<T> {
        return sql.begin(async (tx) => {
            await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
            await tx`select set_config('request.jwt.claim.email', ${`${uid}@test.local`}, true)`;
            return fn(tx as unknown as Sql);
        }) as Promise<T>;
    }

    beforeAll(async () => {
        sql = postgres(TEST_DB_URL!, { max: 4 });

        await sql.unsafe(SHIM_AUTH);
        await sql.unsafe(readFileSync(join(SCHEMA_DIR, BASELINE), 'utf8'));
        const migrations = readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql') && f >= MIGRATIONS_APRES_BASELINE)
            .sort();
        // Garde-fou : si le filtre ne ramène rien, les tests passeraient sur un
        // schéma sans le correctif — donc en silence. Mieux vaut échouer ici.
        expect(migrations.length).toBeGreaterThan(0);
        for (const f of migrations) {
            await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        }

        for (const id of TOUS) {
            await sql`insert into auth.users (id, email) values (${id}, ${`${id}@test.local`})`;
        }
        const perso = async (uid: string) => {
            const rows = await sql`select id from public.workspaces where owner_id = ${uid}`;
            expect(rows).toHaveLength(1);
            return rows[0]!.id as string;
        };
        wsA = await perso(ownerA);
        wsB = await perso(ownerB);

        // memberA / viewerA rejoignent A avec un rôle insuffisant pour l'admin.
        await sql`insert into public.workspace_members (workspace_id, user_id, role) values
                  (${wsA}, ${memberA}, 'member'),
                  (${wsA}, ${viewerA}, 'viewer')`;
    });

    afterAll(async () => {
        if (!sql) return;
        // Ordre de dépendance : les workspaces personnels créés par le trigger
        // sont retirés eux aussi, sinon la FK workspaces.owner_id bloque.
        const ws = await sql`select id from public.workspaces where owner_id = any(${TOUS})`;
        const ids = ws.map((r) => r.id as string);
        await sql`delete from public.workspace_invitations where workspace_id = any(${ids})`;
        await sql`delete from public.workspace_api_keys   where workspace_id = any(${ids})`;
        await sql`delete from public.workspace_members    where workspace_id = any(${ids})`;
        await sql`delete from public.workspaces           where id           = any(${ids})`;
        await sql`delete from public.profiles            where id           = any(${TOUS})`;
        await sql`delete from auth.users                 where id           = any(${TOUS})`;
        await sql.end({ timeout: 5 });
    });

    /** Compte les effets de bord réellement persistés dans un workspace. */
    async function effets(ws: string) {
        const [k] = await sql`select count(*)::int as n from public.workspace_api_keys   where workspace_id = ${ws}`;
        const [i] = await sql`select count(*)::int as n from public.workspace_invitations where workspace_id = ${ws}`;
        return { cles: k!.n as number, invitations: i!.n as number };
    }

    describe('cas passant — le durcissement ne casse pas le parcours légitime', () => {
        it("l'owner crée une clé API dans SON workspace", async () => {
            const rows = await enTantQue(ownerA, (tx) =>
                tx`select * from public.create_workspace_api_key(${wsA}, 'cle legitime')`);
            expect(rows[0]!.raw_key).toMatch(/^ok_[0-9a-f]{32}$/);
            expect(rows[0]!.key_prefix).toBe((rows[0]!.raw_key as string).slice(0, 11));
        });

        it("l'owner invite un membre dans SON workspace", async () => {
            const rows = await enTantQue(ownerA, (tx) =>
                tx`select * from public.invite_workspace_member(${wsA}, 'recrue@test.local', 'member')`);
            expect(rows[0]!.token).toMatch(/^inv_[0-9a-f]{32}$/);
        });
    });

    describe('isolation entre workspaces — RÉGRESSION du contournement NULL', () => {
        it("un étranger au workspace NE PEUT PAS y créer de clé API", async () => {
            const avant = await effets(wsB);
            await expect(
                enTantQue(ownerA, (tx) =>
                    tx`select * from public.create_workspace_api_key(${wsB}, 'cle volee')`),
            ).rejects.toThrow(/forbidden/);
            // Le refus doit être un vrai refus : aucune ligne écrite.
            expect(await effets(wsB)).toEqual(avant);
        });

        it("un étranger au workspace NE PEUT PAS y inviter quelqu'un", async () => {
            const avant = await effets(wsB);
            await expect(
                enTantQue(ownerA, (tx) =>
                    tx`select * from public.invite_workspace_member(${wsB}, 'intrus@test.local', 'admin')`),
            ).rejects.toThrow(/forbidden/);
            expect(await effets(wsB)).toEqual(avant);
        });

        it("workspace_role_of renvoie bien NULL hors du workspace (prémisse de la faille)", async () => {
            const rows = await enTantQue(ownerA, (tx) =>
                tx`select public.workspace_role_of(${wsB}) as role`);
            expect(rows[0]!.role).toBeNull();
        });
    });

    describe('rôles insuffisants dans SON PROPRE workspace', () => {
        for (const [libelle, uid] of [['viewer', viewerA], ['member', memberA]] as const) {
            it(`un ${libelle} ne peut pas créer de clé API`, async () => {
                const avant = await effets(wsA);
                await expect(
                    enTantQue(uid, (tx) =>
                        tx`select * from public.create_workspace_api_key(${wsA}, ${`cle ${libelle}`})`),
                ).rejects.toThrow(/forbidden/);
                expect((await effets(wsA)).cles).toBe(avant.cles);
            });

            it(`un ${libelle} ne peut pas inviter`, async () => {
                const avant = await effets(wsA);
                await expect(
                    enTantQue(uid, (tx) =>
                        tx`select * from public.invite_workspace_member(${wsA}, ${`x-${libelle}@test.local`}, 'member')`),
                ).rejects.toThrow(/forbidden/);
                expect((await effets(wsA)).invitations).toBe(avant.invitations);
            });
        }
    });

    describe('appelant non authentifié', () => {
        it("sans auth.uid(), aucune création de clé API n'est possible", async () => {
            const avant = await effets(wsA);
            await expect(
                sql`select * from public.create_workspace_api_key(${wsA}, 'cle anonyme')`,
            ).rejects.toThrow(/forbidden/);
            expect((await effets(wsA)).cles).toBe(avant.cles);
        });

        it("sans auth.uid(), aucune invitation n'est possible", async () => {
            const avant = await effets(wsA);
            await expect(
                sql`select * from public.invite_workspace_member(${wsA}, 'anon@test.local', 'member')`,
            ).rejects.toThrow(/forbidden/);
            expect((await effets(wsA)).invitations).toBe(avant.invitations);
        });
    });
});
