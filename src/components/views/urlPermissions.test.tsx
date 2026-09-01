import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceRole } from '../../auth/permissions';
import { parseAppRoute } from '../../routing/appUrl';

/**
 * Escalade par l'URL — les vues d'administration sont adressables.
 *
 * `?v=members`, `?v=api-keys` et `?edit=1` se tapent à la main : le routeur les
 * accepte quel que soit le rôle (c'est volontaire, cf. appUrl.ts — il ne connaît
 * pas les rôles et doit préserver `?invite=`). La barre latérale n'en masque pas
 * les entrées non plus. Autrement dit : rien n'empêche un `viewer` d'ATTEINDRE
 * ces vues, et ces tests le vérifient explicitement plutôt que de le supposer.
 *
 * Ce qui doit tenir, c'est que la vue atteinte n'OFFRE aucune action réservée,
 * et qu'elle n'aille même pas chercher les données réservées.
 *
 * Ces tests portent sur ce que l'interface propose. L'autorisation réelle est
 * garantie ailleurs, et testée ailleurs : RLS + RPC
 * (orchestrator/tests/workspaceRpcSecurity.integration.test.ts).
 */

const LECTURE_SEULE = ['graph:read', 'node:read', 'execution:read'];

const permissionsMock = vi.hoisted(() => ({
    // Défaut le plus restrictif : chaque test endosse ensuite un rôle explicite.
    can: vi.fn((permission: string) =>
        ['graph:read', 'node:read', 'execution:read'].includes(permission),
    ),
    role: null as WorkspaceRole | null,
    isAdmin: false,
    isLocalMode: false,
}));
vi.mock('../../auth/usePermissions', () => ({ usePermissions: () => permissionsMock }));

vi.mock('../../contexts/WorkspaceContext', () => ({
    useWorkspaceContext: () => ({
        activeId: 'ws-1',
        activeWorkspace: { id: 'ws-1', name: 'Workspace test', role: permissionsMock.role },
        workspaces: [],
        loading: false,
    }),
}));

vi.mock('../../hooks/useSession', () => ({
    useSession: () => ({ session: { user: { id: 'u-1', email: 'u@test.local' } }, loading: false }),
}));

vi.mock('../../feedback/FeedbackContext', () => ({
    useFeedback: () => ({ notify: vi.fn(), confirm: vi.fn(async () => true) }),
}));

/**
 * Espionne les tables/RPC réellement sollicitées. Un `viewer` ne doit pas
 * seulement voir des boutons grisés : la vue ne doit pas non plus tenter de
 * lire les clés API — une requête refusée reste une requête de trop.
 */
const supabaseMock = vi.hoisted(() => ({ tablesLues: [] as string[], rpcAppeles: [] as string[] }));

vi.mock('../../lib/supabase', () => {
    const resultat = { data: [], error: null };
    const chaine: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'gt', 'in', 'neq']) {
        chaine[m] = () => chaine;
    }
    chaine.then = (r: (v: typeof resultat) => unknown) => Promise.resolve(resultat).then(r);
    return {
        isSupabaseConfigured: true,
        supabase: {
            from: (table: string) => {
                supabaseMock.tablesLues.push(table);
                return chaine;
            },
            rpc: (nom: string) => {
                supabaseMock.rpcAppeles.push(nom);
                return Promise.resolve(resultat);
            },
        },
    };
});

const { MembersView } = await import('./MembersView');
const { ApiKeysView } = await import('./ApiKeysView');

/** Endosse un rôle, comme le ferait `useWorkspaceContext` en conditions réelles. */
function endosser(role: WorkspaceRole) {
    permissionsMock.role = role;
    permissionsMock.isAdmin = role === 'owner' || role === 'admin';
    permissionsMock.can.mockImplementation((p: string) =>
        role === 'viewer' ? LECTURE_SEULE.includes(p) : true,
    );
}

beforeEach(() => {
    supabaseMock.tablesLues = [];
    supabaseMock.rpcAppeles = [];
    permissionsMock.isLocalMode = false;
});

describe("le routeur n'est pas un garde-fou (constat explicite)", () => {
    it('les vues réservées restent adressables, quel que soit le rôle', () => {
        expect(parseAppRoute('?v=members').view).toBe('members');
        expect(parseAppRoute('?v=api-keys').view).toBe('api-keys');
        // `?edit=1` est lu tel quel : le bornage par le rôle se fait dans App.tsx,
        // en UN SEUL endroit (`editionDemandee && peutEditerAgents`), et non au
        // cas par cas chez les consommateurs — un site oublié rouvrait la brèche.
        expect(parseAppRoute('?edit=1').editMode).toBe(true);
    });
});

describe('?v=members atteint par un rôle non administrateur', () => {
    for (const role of ['viewer', 'member'] as const) {
        it(`un ${role} ne se voit proposer aucune action d'administration`, async () => {
            endosser(role);
            render(<MembersView />);

            expect(await screen.findByText(/ne permet pas d'inviter/i)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /inviter/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /révoquer/i })).not.toBeInTheDocument();
        });
    }

    it('un admin retrouve bien le formulaire d\'invitation (le durcissement ne sur-bloque pas)', async () => {
        endosser('admin');
        render(<MembersView />);
        expect(await screen.findByRole('button', { name: /inviter/i })).toBeInTheDocument();
    });
});

describe('?v=api-keys atteint par un rôle non administrateur', () => {
    for (const role of ['viewer', 'member'] as const) {
        it(`un ${role} ne peut ni créer ni révoquer, et les clés ne sont pas chargées`, async () => {
            endosser(role);
            render(<ApiKeysView />);

            expect(await screen.findByText(/ne permet pas de consulter/i)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /créer/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /révoquer/i })).not.toBeInTheDocument();
            // Aucune tentative de lecture : la vue ne sollicite pas la table.
            await waitFor(() => {
                expect(supabaseMock.tablesLues).not.toContain('workspace_api_keys');
            });
            expect(supabaseMock.rpcAppeles).not.toContain('create_workspace_api_key');
        });
    }

    it('un admin déclenche bien la lecture des clés', async () => {
        endosser('admin');
        render(<ApiKeysView />);
        await waitFor(() => {
            expect(supabaseMock.tablesLues).toContain('workspace_api_keys');
        });
    });
});
