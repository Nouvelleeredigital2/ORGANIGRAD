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

    // Audit P2 : `onRun` n'était jamais désactivé pendant l'exécution — un
    // second clic pendant la fenêtre EXECUTING relançait le même nœud.
    it('désactive Run tant que le nœud est EXECUTING (anti double-clic)', () => {
        const onRun = vi.fn();
        const node: HybridNode = {
            ...baseNode,
            id: 'ia-2',
            type: 'AGENT_IA',
            status: 'EXECUTING',
        };
        render(<HybridNodeCard node={node} onRun={onRun} />);
        const btn = screen.getByRole('button', { name: /En cours/i }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        fireEvent.click(btn);
        expect(onRun).not.toHaveBeenCalled();
    });

    // Audit P3 : la carte entière est cliquable (onOpen) mais n'était
    // atteignable ni au clavier ni par lecteur d'écran (aucun rôle, aucun
    // ordre de tabulation).
    it('ouvre la fiche au clavier (Entrée) — accessibilité', () => {
        const onOpen = vi.fn();
        render(<HybridNodeCard node={baseNode} onOpen={onOpen} />);
        const card = screen.getByRole('button', { name: /Ouvrir la fiche de Alice Martin/i });
        expect(card).toHaveAttribute('tabIndex', '0');
        fireEvent.keyDown(card, { key: 'Enter' });
        expect(onOpen).toHaveBeenCalledWith(baseNode);
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

    it('demande confirmation avant de supprimer (parité avec la carte RH)', () => {
        const onDelete = vi.fn();
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

        render(<HybridNodeCard node={baseNode} isEditMode onDelete={onDelete} />);
        fireEvent.click(screen.getByRole('button', { name: /Supprimer/i }));

        expect(confirmSpy).toHaveBeenCalledOnce();
        expect(onDelete).not.toHaveBeenCalled();

        confirmSpy.mockReturnValue(true);
        fireEvent.click(screen.getByRole('button', { name: /Supprimer/i }));
        expect(onDelete).toHaveBeenCalledOnce();

        confirmSpy.mockRestore();
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

/**
 * Risque couvert : re-fabriquer l'écran qu'on vient de corriger.
 *
 * Vingt bots en ligne s'affichaient tous « En repos », parce que l'import
 * jetait la présence rapportée par LINK. La présence ne remplace PAS le statut
 * d'exécution : les deux coexistent sur la carte. Et comme l'import est manuel,
 * un relevé ancien ne doit jamais être présenté comme l'état courant.
 */
describe('HybridNodeCard — présence rapportée par la source', () => {
    const bot: HybridNode = {
        ...baseNode,
        id: 'bot-1',
        type: 'AGENT_IA',
        nom: 'marc.fbdesign.bot',
        roleTitre: 'Directeur artistique Facebook',
        status: 'IDLE',
    };

    it('affiche « En ligne » À CÔTÉ du statut, sans le remplacer', () => {
        render(
            <HybridNodeCard
                node={{
                    ...bot,
                    sourceObservation: {
                        presence: 'online',
                        observedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
                        cadence: 'à la demande (gate 3)',
                    },
                }}
            />,
        );

        expect(screen.getByText('En ligne')).toBeInTheDocument();
        // Le statut d'exécution Organigrad reste affiché : les deux sont vrais.
        expect(screen.getByText('En repos')).toBeInTheDocument();
        expect(screen.getByText(/relevé il y a 5 min/)).toBeInTheDocument();
        expect(screen.getByText(/gate 3/)).toBeInTheDocument();
    });

    it("date toujours le relevé, même frais — sans quoi la pastille se lit comme du temps réel", () => {
        render(
            <HybridNodeCard
                node={{
                    ...bot,
                    sourceObservation: {
                        presence: 'online',
                        observedAt: new Date().toISOString(),
                    },
                }}
            />,
        );
        expect(screen.getByText(/relevé/)).toBeInTheDocument();
    });

    it('montre une observation périmée comme un fait daté, pas comme un état courant', () => {
        render(
            <HybridNodeCard
                node={{
                    ...bot,
                    sourceObservation: {
                        presence: 'online',
                        observedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
                    },
                }}
            />,
        );

        const badge = screen.getByText('En ligne');
        expect(screen.getByText(/relevé il y a 3 j/)).toBeInTheDocument();
        // Ton neutre : la couleur vive affirmerait une présence actuelle.
        expect(badge.className).not.toMatch(/green|52,199,89/);
    });

    it("n'affiche aucun badge pour un nœud natif sans observation", () => {
        render(<HybridNodeCard node={bot} />);
        expect(screen.queryByText('En ligne')).not.toBeInTheDocument();
        expect(screen.queryByText(/relevé/)).not.toBeInTheDocument();
    });
});
