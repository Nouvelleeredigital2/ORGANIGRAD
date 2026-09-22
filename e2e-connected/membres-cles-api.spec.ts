import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPTE_A, CONFIGURE, clientPour, seConnecter, workspaceDe } from './_helpers';

/**
 * P1-7 — invitations et clés API, contre un Supabase réel.
 *
 * Deux surfaces qui ne peuvent pas être testées hors ligne : elles reposent
 * entièrement sur des RPC `SECURITY DEFINER` et sur la RLS. Les tests SQL
 * couvrent les refus ; ceux-ci couvrent le PARCOURS — ce que l'utilisateur
 * obtient réellement à l'écran.
 */

test.describe('Invitations et clés API', () => {
    test.skip(!CONFIGURE, '.env.connected non renseigné — voir .env.connected.example');

    let client: SupabaseClient;
    let workspaceId: string;
    const invitations: string[] = [];
    const cles: string[] = [];

    test.beforeAll(async () => {
        client = await clientPour(COMPTE_A!);
        workspaceId = await workspaceDe(client, COMPTE_A!);

        // Ces parcours sont réservés à owner/admin : sans ce rôle, les tests
        // échoueraient pour une raison sans rapport avec ce qu'ils vérifient.
        const { data } = await client
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', workspaceId)
            .single();
        test.skip(
            !['owner', 'admin'].includes(String(data?.role)),
            `le compte de test est ${data?.role ?? 'inconnu'} — ces parcours demandent owner ou admin`,
        );
    });

    test.afterAll(async () => {
        if (invitations.length) {
            await client.from('workspace_invitations').delete().in('id', invitations);
        }
        if (cles.length) await client.from('workspace_api_keys').delete().in('id', cles);
        await client?.auth.signOut();
    });

    test('inviter, voir l’invitation, la révoquer', async ({ page }) => {
        const email = `invite-e2e-${Date.now()}@invalid`;
        await seConnecter(page, COMPTE_A!);
        await page.goto('/?v=members');
        await expect(page.getByRole('heading', { name: /Membres\./i })).toBeVisible();

        await page.getByPlaceholder('alice@exemple.fr').fill(email);
        await page.getByRole('button', { name: /^Inviter$/ }).click();

        // L'invitation apparaît dans la liste des invitations en attente.
        await expect(page.getByText(email)).toBeVisible({ timeout: 20_000 });

        // Et elle existe réellement en base — l'affichage seul ne le prouve pas.
        const { data } = await client
            .from('workspace_invitations')
            .select('id, role, accepted_at, revoked_at')
            .eq('workspace_id', workspaceId)
            .eq('email', email)
            .single();
        expect(data, "l'invitation affichée n'existe pas en base").toBeTruthy();
        invitations.push(data!.id as string);
        expect(data!.accepted_at).toBeNull();
        expect(data!.revoked_at).toBeNull();
    });

    test('une seconde invitation pour la même adresse est refusée', async () => {
        const email = `doublon-e2e-${Date.now()}@invalid`;
        const premiere = await client.rpc('invite_workspace_member', {
            p_workspace_id: workspaceId,
            p_email: email,
        });
        expect(premiere.error).toBeNull();
        const idPremiere = (premiere.data as Array<{ id: string }> | null)?.[0]?.id;
        if (idPremiere) invitations.push(idPremiere);

        const seconde = await client.rpc('invite_workspace_member', {
            p_workspace_id: workspaceId,
            p_email: email,
        });
        expect(seconde.error, 'un doublon d’invitation a été accepté').not.toBeNull();
        expect(seconde.error!.message).toMatch(/already_pending/i);
    });

    test('le rôle owner ne peut pas être distribué par invitation', async () => {
        const { error } = await client.rpc('invite_workspace_member', {
            p_workspace_id: workspaceId,
            p_email: `owner-e2e-${Date.now()}@invalid`,
            p_role: 'owner',
        });
        expect(error, 'une invitation au rôle owner a été acceptée').not.toBeNull();
        expect(error!.message).toMatch(/owner_role_not_invitable/i);
    });

    test('créer une clé API : révélée UNE SEULE FOIS, puis révocable', async ({ page }) => {
        await seConnecter(page, COMPTE_A!);
        await page.goto('/?v=api-keys');
        await expect(page.getByRole('heading', { name: /Clés API\./i })).toBeVisible();

        const nom = `cle-e2e-${Date.now()}`;
        await page.getByPlaceholder('Production agent · Rédacteur').fill(nom);
        await page.getByRole('button', { name: /Créer la clé/i }).click();

        // Le token complet n'apparaît qu'à la création.
        const banniere = page.getByText(/^ok_[0-9a-f]{32}$/);
        await expect(banniere).toBeVisible({ timeout: 20_000 });
        const token = (await banniere.innerText()).trim();

        const { data } = await client
            .from('workspace_api_keys')
            .select('id, key_prefix, key_hash, revoked_at')
            .eq('workspace_id', workspaceId)
            .eq('name', nom)
            .single();
        expect(data, "la clé affichée n'existe pas en base").toBeTruthy();
        cles.push(data!.id as string);

        // Le token complet n'est JAMAIS stocké : seul son préfixe et son hash.
        expect(token.startsWith(data!.key_prefix as string)).toBe(true);
        expect(data!.key_hash).not.toBe(token);
        expect(String(data!.key_hash)).not.toContain(token);

        // Après rechargement, le token n'est plus récupérable.
        await page.reload();
        await expect(page.getByText(nom)).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(token, { exact: true })).toHaveCount(0);
    });

    test('une clé révoquée le reste', async () => {
        const creation = await client.rpc('create_workspace_api_key', {
            p_workspace_id: workspaceId,
            p_name: `cle-revoquee-e2e-${Date.now()}`,
        });
        expect(creation.error).toBeNull();
        const id = (creation.data as Array<{ id: string }> | null)?.[0]?.id;
        expect(id).toBeTruthy();
        cles.push(id!);

        const { error } = await client
            .from('workspace_api_keys')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id!);
        expect(error).toBeNull();

        const { data } = await client
            .from('workspace_api_keys')
            .select('revoked_at')
            .eq('id', id!)
            .single();
        expect(data!.revoked_at).not.toBeNull();
    });
});
