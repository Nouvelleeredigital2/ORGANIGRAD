import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileFiche } from './ProfileFiche';
import type { Agent } from '../types/agent';

const AGENT: Agent = {
    id: '1',
    nom: 'MARTIN',
    prenom: 'Alice',
    fonction: 'Cheffe de projet',
    titre: 'Attachée principale',
    service: 'Recrutement',
    pole: 'DRH',
    rattachementId: null,
    gradeStyle: 'Expert',
    typeTemps: 'Temps complet',
    nbi: '15',
    email: 'alice.martin@example.org',
};

describe('ProfileFiche v2', () => {
    it("ne s'affiche pas quand fermé", () => {
        render(<ProfileFiche isOpen={false} agent={AGENT} onClose={() => {}} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('affiche identité, chips et coordonnées', () => {
        render(<ProfileFiche isOpen agent={AGENT} onClose={() => {}} />);
        expect(screen.getByText(/Alice/)).toBeInTheDocument();
        expect(screen.getByText(/MARTIN/)).toBeInTheDocument();
        expect(screen.getByText('Cheffe de projet')).toBeInTheDocument();
        // chips (apparaissent aussi dans la grille — donc plusieurs occurrences attendues)
        expect(screen.getAllByText('DRH').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Recrutement').length).toBeGreaterThanOrEqual(1);
        // sections
        expect(screen.getByText('Identité')).toBeInTheDocument();
        expect(screen.getByText('Coordonnées')).toBeInTheDocument();
        // email — uniquement si présent sur l'agent, plus de génération hardcodée
        expect(screen.getByText('alice.martin@example.org')).toBeInTheDocument();
    });

    it('Contacter et Voir dans l\'organigramme appellent les callbacks', () => {
        const onContact = vi.fn();
        const onLocate = vi.fn();
        render(
            <ProfileFiche
                isOpen
                agent={AGENT}
                onClose={() => {}}
                onContact={onContact}
                onLocate={onLocate}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Contacter/i }));
        expect(onContact).toHaveBeenCalledWith(AGENT);
        fireEvent.click(screen.getByRole('button', { name: /Voir dans l'organigramme/i }));
        expect(onLocate).toHaveBeenCalledWith(AGENT);
    });
});
