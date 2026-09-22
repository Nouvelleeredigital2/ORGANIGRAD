import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
        const node: HybridNode = onSave.mock.calls[0]![0];
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

    // Audit P2 : le bouton n'était pas désactivé pendant l'appel async
    // d'onSave — un double-clic déclenchait deux upserts.
    it("désactive le bouton pendant l'enregistrement (anti double-clic)", async () => {
        let resolveSave!: () => void;
        const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
        render(<NodeEditor isOpen node={null} onClose={() => {}} onSave={onSave} />);
        fireEvent.change(screen.getByPlaceholderText('Rédacteur Campagne'), {
            target: { value: 'Rédacteur Test' },
        });
        fireEvent.change(screen.getByPlaceholderText('Génère textes & visuels'), {
            target: { value: 'Génère du contenu' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
        expect(onSave).toHaveBeenCalledTimes(1);

        const button = await screen.findByRole('button', { name: 'Enregistrement…' });
        expect((button as HTMLButtonElement).disabled).toBe(true);

        // Un second clic pendant l'enregistrement ne déclenche pas un second appel.
        fireEvent.click(button);
        expect(onSave).toHaveBeenCalledTimes(1);

        await act(async () => resolveSave());
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Créer' })).not.toBeDisabled(),
        );
    });

    /**
     * Risque couvert : ouvrir un nœud dont le prompt est chiffré puis
     * enregistrer sans y toucher détruisait le prompt en base.
     */
    describe('champ chiffré', () => {
        const chiffre: HybridNode = {
            id: 'n1',
            type: 'AGENT_IA',
            nom: 'Rédacteur',
            roleTitre: 'Génère des textes',
            parentID: null,
            gradeId: 'Expert',
            status: 'IDLE',
            encrypted: { systemPrompt: true },
        };

        it("n'affiche aucune zone de saisie et conserve le drapeau à l'enregistrement", () => {
            const onSave = vi.fn();
            render(<NodeEditor isOpen node={chiffre} onClose={() => {}} onSave={onSave} />);

            expect(screen.getByText(/Configuré \(chiffré\)/i)).toBeInTheDocument();
            expect(screen.queryByPlaceholderText('Tu es un expert en…')).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

            const saved: HybridNode = onSave.mock.calls[0]![0];
            // Drapeau conservé + valeur absente ⇒ le repo omettra la colonne,
            // donc le secret survit.
            expect(saved.encrypted?.systemPrompt).toBe(true);
            expect(saved.systemPrompt).toBeUndefined();
        });

        it('libère le champ et retire le drapeau après « Remplacer »', () => {
            const onSave = vi.fn();
            render(<NodeEditor isOpen node={chiffre} onClose={() => {}} onSave={onSave} />);

            fireEvent.click(screen.getByRole('button', { name: /Remplacer/i }));
            fireEvent.change(screen.getByPlaceholderText('Tu es un expert en…'), {
                target: { value: 'Nouveau prompt.' },
            });
            fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

            const saved: HybridNode = onSave.mock.calls[0]![0];
            expect(saved.systemPrompt).toBe('Nouveau prompt.');
            expect(saved.encrypted?.systemPrompt).toBeUndefined();
        });
    });
});
