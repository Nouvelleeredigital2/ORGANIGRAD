import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BorealRecipeSetup } from './BorealRecipeSetup';

const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const options = {
    projects: [
        { name: 'Un autre projet', ref: { projectId: ids[5]!, workspaceId: ids[5]!, sourceApp: 'organigrad', canonicalUrl: 'https://organigrad.example.test/projects/other' } },
        { name: 'TEST FICTIF — Atelier Boréal', ref: { projectId: ids[0]!, workspaceId: ids[0]!, sourceApp: 'organigrad', canonicalUrl: 'https://organigrad.example.test/projects/boreal' } },
    ],
    humans: [{ id: ids[1]!, name: 'Laurent' }],
    workers: [
        { id: ids[2]!, name: 'Éric' }, { id: ids[3]!, name: 'Design' },
        { id: ids[4]!, name: 'Engine' }, { id: ids[5]!, name: 'Gardien de marque' },
    ],
};

it('prepares only the Atelier Boréal recipe with named pilot roles and no schedule', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    render(<BorealRecipeSetup options={options} onCreate={create} />);
    fireEvent.change(screen.getByLabelText('Projet de recette'), { target: { value: ids[0] } });
    fireEvent.change(screen.getByLabelText('Éric — veille et rédaction'), { target: { value: ids[2] } });
    fireEvent.change(screen.getByLabelText('Design — brief visuel'), { target: { value: ids[3] } });
    fireEvent.change(screen.getByLabelText('Engine — génération'), { target: { value: ids[4] } });
    fireEvent.change(screen.getByLabelText('Gardien de marque — contrôle'), { target: { value: ids[5] } });
    fireEvent.change(screen.getByLabelText('Validation humaine finale'), { target: { value: ids[1] } });
    fireEvent.click(screen.getByRole('button', { name: 'Préparer la recette Atelier Boréal' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({
        projectId: ids[0], ericId: ids[2], designId: ids[3], engineId: ids[4], guardianId: ids[5], humanId: ids[1],
    }));
    expect(screen.getByText(/La programmation est désactivée/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Un autre projet' })).not.toBeInTheDocument();
});
