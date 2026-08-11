import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { OrchestrationView } from './OrchestrationView';
import type { HybridNode } from '../../types/hybridNode';
import type { WorkspaceRole } from '../../auth/permissions';

const bridgeMock = vi.hoisted(() => ({
    connected: false,
    connectionState: 'local' as const,
    nodes: [] as HybridNode[],
    client: null,
    runNode: vi.fn<(id: string) => Promise<void>>(async () => {}),
    runFlow: vi.fn<(id: string) => Promise<void>>(async () => {}),
    approve: vi.fn<(id: string) => Promise<void>>(async () => {}),
    reject: vi.fn<(id: string, motif: string) => Promise<void>>(async () => {}),
    reset: vi.fn<(id: string) => Promise<void>>(async () => {}),
}));

vi.mock('../../hooks/useOrchestratorBridge', () => ({
    useOrchestratorBridge: () => bridgeMock,
}));

const permissionsMock = vi.hoisted(() => ({
    can: vi.fn(() => true),
    role: null as WorkspaceRole | null,
    isLocalMode: true,
}));

vi.mock('../../auth/usePermissions', () => ({
    usePermissions: () => permissionsMock,
}));

/** Sème des nœuds dans le cache local (espace offline). */
const seed = (nodes: Partial<HybridNode>[]) =>
    localStorage.setItem(
        'organigrad_hybrid_nodes_v1::local',
        JSON.stringify(
            nodes.map((n) => ({
                type: 'AGENT_IA',
                roleTitre: 'r',
                parentID: null,
                gradeId: 'Expert',
                status: 'IDLE',
                ...n,
            })),
        ),
    );

describe('OrchestrationView', () => {
    beforeEach(() => {
        localStorage.clear();
        bridgeMock.connected = false;
        bridgeMock.connectionState = 'local';
        permissionsMock.can.mockReturnValue(true);
        permissionsMock.role = null;
        permissionsMock.isLocalMode = true;
        bridgeMock.nodes = [];
        Object.values(bridgeMock).forEach((v) => {
            if (typeof v === 'function' && 'mockClear' in v) v.mockClear();
        });
    });

    it("démarre vierge — affiche l'état vide quand aucun agent ni nœud", () => {
        render(<OrchestrationView rawAgents={[]} />);
        expect(screen.getByRole('heading', { name: /Orchestration\./i })).toBeInTheDocument();
        expect(screen.getByText(/Aucun nœud dans la chaîne/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Créer le premier nœud/i })).toBeInTheDocument();
    });

    it("désactive 'Lancer la chaîne' tant qu'aucun nœud n'existe", () => {
        render(<OrchestrationView rawAgents={[]} />);
        const btn = screen.getByRole('button', { name: /Lancer la chaîne/i }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it("ouvre l'éditeur quand on clique sur 'Nouveau nœud'", () => {
        render(<OrchestrationView rawAgents={[]} />);
        fireEvent.click(screen.getByRole('button', { name: /Nouveau nœud/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Rédacteur Campagne')).toBeInTheDocument();
    });

    it("ferme l'éditeur via la touche Échap", () => {
        render(<OrchestrationView rawAgents={[]} />);
        fireEvent.click(screen.getByRole('button', { name: /Nouveau nœud/i }));
        expect(screen.queryByRole('dialog')).toBeInTheDocument();
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('focus le Spotlight via ⌘K', () => {
        render(<OrchestrationView rawAgents={[]} />);
        const input = screen.getByPlaceholderText(/Rechercher/i) as HTMLInputElement;
        expect(document.activeElement).not.toBe(input);
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        });
        expect(document.activeElement).toBe(input);
    });

    it("affiche les humains issus du CSV quand rawAgents est fourni", () => {
        render(
            <OrchestrationView
                rawAgents={[
                    {
                        id: 'a1',
                        nom: 'MARTIN',
                        prenom: 'Alice',
                        fonction: 'Cheffe',
                        titre: '',
                        service: 'DRH',
                        pole: 'DRH',
                        rattachementId: null,
                        gradeStyle: 'Direction',
                        typeTemps: 'Temps complet',
                    },
                ]}
            />,
        );
        // L'état vide ne doit pas s'afficher
        expect(screen.queryByText(/Aucun nœud dans la chaîne/i)).toBeNull();
        // L'agent est rendu (surname en CAPS via HybridNodeCard)
        expect(screen.getAllByText(/MARTIN/).length).toBeGreaterThanOrEqual(1);
    });

    /**
     * Risque couvert : « Lancer la chaîne » ne lançait que `roots[0]`. Les
     * humains issus du CSV étant concaténés en tête, les nœuds IA créés par
     * l'utilisateur — également racines — n'étaient jamais exécutés, sans le
     * moindre message.
     */
    it('lance TOUTES les racines, pas seulement la première', async () => {
        seed([
            { id: 'racine-a', nom: 'A' },
            { id: 'racine-b', nom: 'B' },
            { id: 'enfant', nom: 'C', parentID: 'racine-a' },
        ]);
        bridgeMock.connected = true;

        render(<OrchestrationView rawAgents={[]} />);
        fireEvent.click(screen.getByRole('button', { name: /Lancer la chaîne/i }));

        await waitFor(() => expect(bridgeMock.runFlow).toHaveBeenCalledTimes(2));
        const lances = bridgeMock.runFlow.mock.calls.map((c) => c[0]);
        expect(lances).toEqual(expect.arrayContaining(['racine-a', 'racine-b']));
        expect(lances).not.toContain('enfant');
    });

    /**
     * Risque couvert : une décision humaine perdue. Le panneau se refermait et
     * le motif de rejet était vidé même quand l'appel distant avait échoué.
     */
    it('conserve le motif et le panneau ouvert quand le rejet échoue', async () => {
        seed([{ id: 'h1', nom: 'Valideur', type: 'HUMAN', status: 'WAITING_HUMAN_APPROVAL' }]);
        bridgeMock.connected = true;
        bridgeMock.reject.mockRejectedValueOnce(new Error('403'));

        render(<OrchestrationView rawAgents={[]} />);
        fireEvent.click(await screen.findByRole('button', { name: /Valider \(1\)|Valider/i }));

        fireEvent.click(await screen.findByRole('button', { name: /^Rejeter$/i }));
        const motif = screen.getByPlaceholderText(/Motif du rejet/i);
        fireEvent.change(motif, { target: { value: 'Incomplet' } });
        fireEvent.keyDown(motif, { key: 'Enter' });

        await waitFor(() => expect(bridgeMock.reject).toHaveBeenCalled());
        // Le motif survit à l'échec et le panneau reste ouvert.
        expect(screen.getByPlaceholderText(/Motif du rejet/i)).toHaveValue('Incomplet');
    });

    it('disables the empty-state creation CTA for a read-only role', () => {
        permissionsMock.can.mockReturnValue(false);
        permissionsMock.role = 'viewer';
        permissionsMock.isLocalMode = false;
        render(<OrchestrationView rawAgents={[]} />);
        expect(screen.getByRole('button', { name: /premier/i })).toBeDisabled();
    });
});
