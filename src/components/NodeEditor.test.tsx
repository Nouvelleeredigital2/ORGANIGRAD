import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeEditor } from './NodeEditor';
import type { HybridNode } from '../types/hybridNode';

describe('NodeEditor', () => {
    it('crée un nouveau nœud IA avec skills', () => {
        const onSave = vi.fn();
        render(<NodeEditor isOpen node={null} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByPlaceholderText('Rédacteur Campagne'), {
            target: { value: 'Rédacteur Test' },
        });
        fireEvent.change(screen.getByPlaceholderText('Génère textes & visuels'), {
            target: { value: 'Génère du contenu' },
        });
        fireEvent.change(screen.getByPlaceholderText('rag, web-search, image-gen'), {
            target: { value: 'rag, image-gen' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
        expect(onSave).toHaveBeenCalled();
        const node: HybridNode = onSave.mock.calls[0][0];
        expect(node.nom).toBe('Rédacteur Test');
        expect(node.skills).toEqual(['rag', 'image-gen']);
        expect(node.type).toBe('AGENT_IA');
    });

    it("désactive le bouton tant que nom ou rôle est vide", () => {
        const onSave = vi.fn();
        render(<NodeEditor isOpen node={null} onClose={() => {}} onSave={onSave} />);
        const create = screen.getByRole('button', { name: 'Créer' }) as HTMLButtonElement;
        expect(create.disabled).toBe(true);
    });
});
