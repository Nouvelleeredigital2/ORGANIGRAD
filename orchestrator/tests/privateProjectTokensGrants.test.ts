import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Droits relevés en lecture seule le 2026-09-09 sur la cible Organigrad
// xucmfdggetwxmpquqjvj : has_table_privilege('service_role','auth.sessions','SELECT')
// et la même sonde sur auth.users renvoient FAUX. Cette fixture reproduit ce
// refus au lieu de l'accorder, pour que le garde-fou ne dépende pas du rôle de
// connexion. Identités synthétiques, aucun accès distant depuis ce test.
const U = '12000000-0000-4000-8000-000000000001';
const W = '22000000-0000-4000-8000-000000000001';
const P = '32000000-0000-4000-8000-000000000001';
const S = '42000000-0000-4000-8000-000000000001';
const db = new PGlite();

const hash = (suffix: string) => `${'a'.repeat(64 - suffix.length)}${suffix}`;
const epoch = () => Math.floor(Date.now() / 1000);

async function insertAsServiceRole(values: {
    hashSuffix: string;
    expiresAt: number;
    issuerExpiresAt?: number;
}) {
    return db.transaction(async tx => {
        await tx.exec('set local role service_role');
        return tx.query(
            `insert into public.personal_project_tokens
               (owner_id,workspace_id,project_id,session_id,name,token_hash,token_prefix,issuer_expires_at,expires_at)
             values ($1,$2,$3,$4,'TEST-GRANTS',$5,'ogp_0123abcd',$6,$7) returning id`,
            [U, W, P, S, hash(values.hashSuffix), values.issuerExpiresAt ?? values.expiresAt, values.expiresAt],
        );
    });
}

beforeAll(async () => {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create table auth.users(id uuid primary key,is_anonymous boolean not null default false,banned_until timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,
        created_at timestamptz not null default now(),not_after timestamptz);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
      grant usage on schema public,auth to authenticated,anon,service_role;
      insert into auth.users(id) values ('${U}');
      insert into public.workspaces values ('${W}');`);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260909090010_projects_and_tasks.sql', import.meta.url), 'utf8'));
    // Seules les tables métier sont ouvertes : auth.* reste refusé comme en ligne.
    await db.exec('grant select on public.workspace_members,public.projects,public.project_tasks to service_role');
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260909150000_private_project_tokens.sql', import.meta.url), 'utf8'));
}, 30000);

beforeEach(async () => {
    await db.exec(`delete from public.personal_project_tokens; delete from auth.sessions;
      delete from public.project_tasks; delete from public.projects; delete from public.workspace_members;
      update auth.users set is_anonymous=false,banned_until=null;
      insert into auth.sessions(id,user_id) values ('${S}','${U}');
      insert into public.workspace_members values ('${W}','${U}','member');
      insert into public.projects(id,workspace_id,name) values ('${P}','${W}','TEST-GRANTS');`);
});

afterAll(async () => { await db.close(); });

describe('jetons projets personnels : droits réels de la cible', () => {
    it('refuse toute lecture directe de auth.sessions à service_role', async () => {
        await expect(db.transaction(async tx => {
            await tx.exec('set local role service_role');
            return tx.query('select 1 from auth.sessions');
        })).rejects.toThrow(/permission denied/i);
    });

    it('émet malgré ce refus, sans accorder de droit sur auth.*', async () => {
        const inserted = await insertAsServiceRole({ hashSuffix: '01', expiresAt: epoch() + 900 });
        expect(inserted.rows).toHaveLength(1);
    });

    it('applique toujours la règle métier : session expirée refusée', async () => {
        await db.query(`update auth.sessions set not_after=now()-interval '1 second' where id=$1`, [S]);
        await expect(insertAsServiceRole({ hashSuffix: '02', expiresAt: epoch() + 900 }))
            .rejects.toThrow(/PERSONAL_PROJECT_TOKEN_INVALID/);
    });

    it('applique toujours la règle métier : compte banni refusé', async () => {
        await db.query(`update auth.users set banned_until=now()+interval '1 hour' where id=$1`, [U]);
        await expect(insertAsServiceRole({ hashSuffix: '03', expiresAt: epoch() + 900 }))
            .rejects.toThrow(/PERSONAL_PROJECT_TOKEN_INVALID/);
    });

    it('n’autorise que la révocation en mise à jour', async () => {
        const created = await insertAsServiceRole({ hashSuffix: '04', expiresAt: epoch() + 900 });
        const id = (created.rows[0] as { id: string }).id;
        await db.transaction(async tx => {
            await tx.exec('set local role service_role');
            await tx.query('update public.personal_project_tokens set revoked_at=now() where id=$1', [id]);
        });
        await expect(db.transaction(async tx => {
            await tx.exec('set local role service_role');
            return tx.query('update public.personal_project_tokens set name=$1 where id=$2', ['AUTRE', id]);
        })).rejects.toThrow();
    });
});
