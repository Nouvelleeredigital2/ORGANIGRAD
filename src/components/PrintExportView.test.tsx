import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrintExportView } from './PrintExportView';
import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';

const AGENT: Agent = {
    id: '1',
    nom: 'MARTIN',
    prenom: 'Alice',
    fonction: 'Cheffe de projet',
    titre: '',
    service: 'Recrutement',
    pole: 'DRH',
    rattachementId: null,
    gradeStyle: 'Direction',
    typeTemps: 'Temps complet',
};
const TREE: TreeNode[] = [{ ...AGENT, children: [] }];

describe('PrintExportView A3', () => {
    it("ne s'affiche pas quand fermé", () => {
        render(
            <PrintExportView isOpen={false} tree={TREE} agents={[AGENT]} onClose={() => {}} />,
        );
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('affiche en-tête, marque, pied de page et annuaire', () => {
        render(
            <PrintExportView
                isOpen
                poleLabel="DRH"
                tree={TREE}
                agents={[AGENT]}
                onClose={() => {}}
            />,
        );
        // Toolbar
        expect(screen.getByText(/Aperçu export/i)).toBeInTheDocument();
        expect(screen.getByText(/DRH · A3 paysage/i)).toBeInTheDocument();
        // Marque
        expect(screen.getByText('Organigrad')).toBeInTheDocument();
        expect(screen.getByText('Organisation')).toBeInTheDocument();
        // Pôle dans le header (peut apparaître ailleurs)
        expect(screen.getAllByText('DRH').length).toBeGreaterThanOrEqual(1);
        // Annuaire
        expect(screen.getByText('Annuaire')).toBeInTheDocument();
        // MARTIN apparaît à la fois dans la carte org et dans l'annuaire
        expect(screen.getAllByText('MARTIN').length).toBeGreaterThanOrEqual(1);
        // Pied
        expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument();
    });

    it('télécharger appelle onDownload', () => {
        const onDownload = vi.fn();
        render(
            <PrintExportView
                isOpen
                tree={TREE}
                agents={[AGENT]}
                onClose={() => {}}
                onDownload={onDownload}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Télécharger le PDF/i }));
        expect(onDownload).toHaveBeenCalledOnce();
    });

    it('clic fermer appelle onClose', () => {
        const onClose = vi.fn();
        render(<PrintExportView isOpen tree={TREE} agents={[AGENT]} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /^Fermer$/i }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
