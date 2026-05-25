import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
