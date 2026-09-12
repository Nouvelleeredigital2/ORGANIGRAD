import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BotsView } from './BotsView';
import type { BotProfile } from '../../types/botProfile';
import type { WorkspaceRole } from '../../auth/permissions';

const bridgeMock = vi.hoisted(() => ({
    connected: false,
    connectionState: 'local' as 'local' | 'connecting' | 'connected' | 'degraded' | 'failed',
    nodes: [],
    client: null as null | { fetchBots: () => Promise<BotProfile[]> },
}));

vi.mock('../../hooks/useOrchestratorBridge', () => ({
    useOrchestratorBridge: () => bridgeMock,
}));

const permissionsMock = vi.hoisted(() => ({
    can: vi.fn((permission: string) => Boolean(permission)),
    role: null as WorkspaceRole | null,
    isLocalMode: true,
    isAdmin: true,
}));

vi.mock('../../auth/usePermissions', () => ({
    usePermissions: () => permissionsMock,
}));

const BOT: BotProfile = {
    id: '00000000-0000-4000-8000-000000000001',
    runtimeId: 'anita.instagram.bot',
    fileName: 'anita.instagram.bot.txt',
    displayName: 'Anita',
    avatarUrl: 'https://images.example.org/anita.png',
    family: 'redacteur',
    brand: 'Nature & Tech',
    network: 'instagram',
    telegramUsername: null,
    mission: 'Adapter un sujet validé à Instagram.',
    personality: '',
    research: '',
    watch: '',
    deliverables: '',
    method: '',
    limits: '',
    usefulContext: '',
    sources: [],
    model: {},
    enabled: true,
    compiledPrompt: 'texte compilé',
    compiledSha256: 'a'.repeat(64),
};

describe('BotsView', () => {
    beforeEach(() => {
        bridgeMock.connectionState = 'local';
        bridgeMock.client = null;
        permissionsMock.can.mockImplementation(() => true);
    });

    it("invite à configurer l'orchestrateur quand aucun n'est connecté", () => {
        render(<BotsView />);
        expect(screen.getByText(/besoin d'un orchestrateur connecté/i)).toBeInTheDocument();
    });

    it('liste les bots une fois connecté', async () => {
        bridgeMock.connectionState = 'connected';
        bridgeMock.client = { fetchBots: vi.fn(async () => [BOT]) };
        render(<BotsView />);
        await waitFor(() => expect(screen.getByText('Anita')).toBeInTheDocument());
        expect(screen.getByText('Rédacteur')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Portrait de Anita' })).toHaveAttribute('src', BOT.avatarUrl);
    });

    it("affiche l'état vide avec une invitation à créer le premier bot", async () => {
        bridgeMock.connectionState = 'connected';
        bridgeMock.client = { fetchBots: vi.fn(async () => []) };
        render(<BotsView />);
        await waitFor(() => expect(screen.getByText(/Aucun bot pour ce workspace/i)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Créer le premier bot/i })).toBeInTheDocument();
    });

    it('allows member editing but hides admin-only deletion', async () => {
        bridgeMock.connectionState = 'connected';
        bridgeMock.client = { fetchBots: vi.fn(async () => [BOT]) };
        permissionsMock.can.mockImplementation((permission) => permission !== 'workspace:admin');
        render(<BotsView />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Éditer Anita' })).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Supprimer Anita' })).not.toBeInTheDocument();
    });

    it('ignores an old workspace response after the new workspace has loaded', async()=>{
        let finish!: (bots:BotProfile[])=>void;
        bridgeMock.connectionState='connected';
        bridgeMock.client={fetchBots:()=>new Promise(resolve=>{finish=resolve;})};
        const view=render(<BotsView/>);
        bridgeMock.client={fetchBots:async()=>[{...BOT,displayName:'Bot workspace B'}]};
        view.rerender(<BotsView/>);
        await screen.findByText('Bot workspace B');
        await act(async()=>{finish([BOT]);});
        await waitFor(()=>expect(screen.queryByText('Anita')).not.toBeInTheDocument());
        expect(screen.getByText('Bot workspace B')).toBeInTheDocument();
    });
});
