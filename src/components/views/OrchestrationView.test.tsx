import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OrchestrationView } from './OrchestrationView';

describe('OrchestrationView', () => {
    beforeEach(() => {
        localStorage.clear();
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
});
