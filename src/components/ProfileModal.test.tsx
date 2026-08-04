import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileModal } from './ProfileModal';
import type { Agent } from '../types/agent';

const agent: Agent = {
    id: '1',
    nom: 'DUPONT',
    prenom: 'Alice',
    fonction: 'Chargee de mission',
    titre: '',
    service: 'Direction',
    pole: 'DRH',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Temps complet',
};

describe('ProfileModal', () => {
    it('keeps the profile editor open when saving fails', async () => {
        const onClose = vi.fn();
        const onSave = vi.fn().mockResolvedValue({ ok: false, message: 'Serveur indisponible.' });
        render(<ProfileModal isOpen onClose={onClose} agent={agent} isEditMode onSave={onSave} />);

        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText('Serveur indisponible.')).toBeInTheDocument();
    });
});
