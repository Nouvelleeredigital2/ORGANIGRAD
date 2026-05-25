import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HybridSpotlight } from './HybridSpotlight';
import type { HybridNode } from '../../types/hybridNode';

const nodes: HybridNode[] = [
    { id: 'h', type: 'HUMAN', nom: 'Camille', roleTitre: 'DirMarketing', parentID: null, gradeId: 'D', status: 'IDLE' },
    { id: 'i', type: 'AGENT_IA', nom: 'Rédacteur', roleTitre: 'Génère', parentID: null, gradeId: 'E', skills: ['rag', 'image-gen'], status: 'IDLE' },
    { id: 'm', type: 'SOFTWARE_MCP', nom: 'BrandGuard', roleTitre: 'Vérifie', parentID: null, gradeId: 'S', skills: ['hex-validate'], status: 'IDLE' },
];

describe('HybridSpotlight', () => {
    it('match par skill', () => {
        const onSelect = vi.fn();
        render(<HybridSpotlight nodes={nodes} onSelect={onSelect} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'image-gen' } });
        const btn = screen.getByText('Rédacteur').closest('button')!;
        fireEvent.click(btn);
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'i' }));
    });

    it('filtre par type MCP', () => {
        render(<HybridSpotlight nodes={nodes} onSelect={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /MCP/i }));
        expect(screen.getByText('BrandGuard')).toBeInTheDocument();
        expect(screen.queryByText('Rédacteur')).toBeNull();
        expect(screen.queryByText('Camille')).toBeNull();
    });
});
