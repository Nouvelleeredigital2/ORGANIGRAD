import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ValidationCenter, type ValidationItem } from './ValidationCenter';
import type { HybridNode } from '../types/hybridNode';

const human: HybridNode = {
    id: 'h1',
    type: 'HUMAN',
    nom: 'Camille Roussel',
    roleTitre: 'Directrice Marketing',
    parentID: null,
    gradeId: 'Direction',
    status: 'WAITING_HUMAN_APPROVAL',
};

const ia: HybridNode = {
    id: 'ia1',
    type: 'AGENT_IA',
    nom: 'Rédacteur',
    roleTitre: 'Génère',
    parentID: 'h1',
    gradeId: 'Expert',
    status: 'IDLE',
};

const items: ValidationItem[] = [
    {
        node: human,
        what: 'Livrable « Campagne »',
        detail: 'Rédacteur → Brand → Fact',
        when: 'à l\'instant',
    },
    { node: ia, what: 'Brief Printemps 2026', detail: '8 sections · 1700 mots', when: 'il y a 4 min' },
];

describe('ValidationCenter — panneau coulissant v2', () => {
    it("ne s'affiche pas quand fermé", () => {
        render(
            <ValidationCenter isOpen={false} items={items} onClose={() => {}} onApprove={() => {}} />,
        );
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('affiche le compteur dans le titre selon le nombre d\'items', () => {
        const { rerender } = render(
            <ValidationCenter isOpen items={[items[0]!]} onClose={() => {}} onApprove={() => {}} />,
        );
        expect(screen.getByRole('heading')).toHaveTextContent(/1 décision vous attend/i);

        rerender(<ValidationCenter isOpen items={items} onClose={() => {}} onApprove={() => {}} />);
        expect(screen.getByRole('heading')).toHaveTextContent(/2 décisions vous attendent/i);
    });

    it('affiche l\'état vide quand aucune décision', () => {
        render(<ValidationCenter isOpen items={[]} onClose={() => {}} onApprove={() => {}} />);
        expect(screen.getByText(/Aucune décision en attente/i)).toBeInTheDocument();
    });

    it('liste les items avec leur libellé et métadonnées', () => {
        render(<ValidationCenter isOpen items={items} onClose={() => {}} onApprove={() => {}} />);
        expect(screen.getByText('Livrable « Campagne »')).toBeInTheDocument();
        expect(screen.getByText('Brief Printemps 2026')).toBeInTheDocument();
        expect(screen.getByText(/à l'instant/)).toBeInTheDocument();
    });

    it('clic Valider appelle onApprove avec le bon nœud', () => {
        const onApprove = vi.fn();
        render(<ValidationCenter isOpen items={items} onClose={() => {}} onApprove={onApprove} />);
        const validateButtons = screen.getAllByRole('button', { name: /Valider/ });
        fireEvent.click(validateButtons[0]!);
        expect(onApprove).toHaveBeenCalledWith(human);
    });

    it('clic sur le bouton Fermer appelle onClose', () => {
        const onClose = vi.fn();
        render(<ValidationCenter isOpen items={items} onClose={onClose} onApprove={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Fermer/i }));
        expect(onClose).toHaveBeenCalled();
    });

    it('clic sur Détails appelle onShowDetails', () => {
        const onShowDetails = vi.fn();
        render(
            <ValidationCenter
                isOpen
                items={items}
                onClose={() => {}}
                onApprove={() => {}}
                onShowDetails={onShowDetails}
            />,
        );
        fireEvent.click(screen.getAllByRole('button', { name: 'Détails' })[0]!);
        expect(onShowDetails).toHaveBeenCalledWith(human);
    });

    it('clic overlay appelle onClose, clic dans le panel ne le ferme pas', () => {
        const onClose = vi.fn();
        const { container } = render(
            <ValidationCenter isOpen items={items} onClose={onClose} onApprove={() => {}} />,
        );
        const overlay = container.querySelector('.dsm-vc-overlay')!;
        const panel = container.querySelector('.dsm-vc-panel')!;
        fireEvent.click(panel);
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalled();
    });

    it('sends only one rejection while the first request is pending', async () => {
        let resolveReject!: (result: boolean) => void;
        const onReject = vi.fn(() => new Promise<boolean>((resolve) => { resolveReject = resolve; }));
        const { container } = render(
            <ValidationCenter isOpen items={[items[0]!]} onClose={() => {}} onApprove={() => {}} onReject={onReject} />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Rejeter/i }));
        fireEvent.change(container.querySelector('input')!, { target: { value: 'A revoir' } });
        const confirm = screen.getByRole('button', { name: /Confirmer/i });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        expect(onReject).toHaveBeenCalledTimes(1);
        expect(confirm).toBeDisabled();
        resolveReject(true);
        await waitFor(() => expect(screen.queryByRole('button', { name: /Confirmer/i })).toBeNull());
    });

    it('affiche le bouton micro (SDK vocal) près du motif de rejet quand le proxy est configuré', () => {
        const voiceCapture = {
            supported: true,
            listening: false,
            muted: false,
            start: vi.fn().mockResolvedValue(undefined),
            pushToTalkStart: vi.fn().mockResolvedValue(undefined),
            pushToTalkEnd: vi.fn(),
            mute: vi.fn(),
            unmute: vi.fn(),
            revoke: vi.fn(),
        };
        render(
            <ValidationCenter
                isOpen
                items={[items[0]!]}
                onClose={() => {}}
                onApprove={() => {}}
                onReject={() => {}}
                voiceProxyBasePath="http://localhost:3001/api/voice/gateway"
                voiceCapture={voiceCapture}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Rejeter/i }));
        expect(screen.getByRole('button', { name: /Dicter au micro/i })).toBeInTheDocument();
    });

    it("n'affiche pas de bouton micro sans proxy vocal configuré (pas d'orchestrateur)", () => {
        render(
            <ValidationCenter isOpen items={[items[0]!]} onClose={() => {}} onApprove={() => {}} onReject={() => {}} />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Rejeter/i }));
        expect(screen.queryByRole('button', { name: /Dicter au micro/i })).toBeNull();
    });
});
