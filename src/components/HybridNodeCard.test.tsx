import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HybridNodeCard from './HybridNodeCard';
import type { HybridNode } from '../types/hybridNode';

const baseNode: HybridNode = {
    id: 'node-abc12345',
    type: 'HUMAN',
    nom: 'Alice Martin',
    roleTitre: 'Directrice Marketing',
    parentID: null,
    gradeId: 'Direction',
    status: 'IDLE',
};

describe('HybridNodeCard', () => {
    it('rend un nœud Humain au repos', () => {
        render(<HybridNodeCard node={baseNode} />);
        // Surnames affichées en MAJUSCULES (convention administrative française)
        expect(screen.getByRole('heading')).toHaveTextContent(/Alice\s+Martin/i);
        expect(screen.getByText('Directrice Marketing')).toBeInTheDocument();
        expect(screen.getByText(/Humain/)).toBeInTheDocument();
        expect(screen.getByText('En repos')).toBeInTheDocument();
    });

    it('affiche le badge de validations en attente pour un humain', () => {
        render(<HybridNodeCard node={baseNode} pendingValidations={3} />);
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('affiche le bouton ⚡ Run pour un AGENT_IA actif', () => {
        const onRun = vi.fn();
        const node: HybridNode = {
            ...baseNode,
            id: 'ia-1',
            type: 'AGENT_IA',
            nom: 'Rédacteur GPT',
            roleTitre: 'Génération de contenus',
            status: 'IDLE',
            systemPrompt: 'Tu es un rédacteur expert en marketing B2B.',
            skills: ['rag', 'web-search', 'image-gen'],
        };
        render(<HybridNodeCard node={node} onRun={onRun} />);
        const btn = screen.getByRole('button', { name: /Run/i });
        fireEvent.click(btn);
        expect(onRun).toHaveBeenCalledOnce();
        expect(screen.getByText(/rédacteur expert/i)).toBeInTheDocument();
        expect(screen.getByText('rag')).toBeInTheDocument();
    });

    it("verrouille la carte en attente d'approbation humaine", () => {
        const node: HybridNode = {
            ...baseNode,
            status: 'WAITING_HUMAN_APPROVAL',
        };
        const onValidate = vi.fn();
        render(<HybridNodeCard node={node} onValidate={onValidate} />);
        expect(screen.getByText(/Validation requise/i)).toBeInTheDocument();
        const btn = screen.getByRole('button', { name: /Valider/i });
        fireEvent.click(btn);
        expect(onValidate).toHaveBeenCalledOnce();
    });

    it('affiche les infos MCP pour un nœud SOFTWARE_MCP', () => {
        const node: HybridNode = {
            ...baseNode,
            id: 'mcp-1',
            type: 'SOFTWARE_MCP',
            nom: 'Charte Graphique Checker',
            roleTitre: 'Vérification colorimétrique',
            mcpConfig: { serverUrl: 'mcp://brand-guard', connectedTo: ['ia-1'] },
            skills: ['hex-validate'],
        };
        render(<HybridNodeCard node={node} />);
        expect(screen.getByText('mcp://brand-guard')).toBeInTheDocument();
        expect(screen.getByText(/Logiciel/)).toBeInTheDocument();
    });
});
