import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContactModal } from './ContactModal';
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

describe('ContactModal', () => {
  it('does not invent contact details when the source data is missing them', () => {
    render(<ContactModal isOpen onClose={() => undefined} agent={agent} />);

    expect(screen.getAllByText('Non renseigne')).toHaveLength(2);
    expect(screen.getByText('Direction')).toBeInTheDocument();
    expect(screen.queryByText('alice.dupont@lhaylesroses.fr')).not.toBeInTheDocument();
    expect(screen.queryByText('01 46 15 33 33')).not.toBeInTheDocument();
  });

  it('keeps the contact editor open when saving fails', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue({ ok: false, message: 'Serveur indisponible.' });
    render(<ContactModal isOpen onClose={onClose} agent={agent} isEditMode onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Serveur indisponible.')).toBeInTheDocument();
  });
});
