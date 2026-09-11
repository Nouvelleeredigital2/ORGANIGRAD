import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BotEditor } from './BotEditor';
import { emptyBotProfile } from '../../types/botProfile';

it('shows draft status without an activation checkbox', () => {
    render(<BotEditor isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText(/Brouillon.*vérification/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('previews a valid portrait, sends it on save and never previews unsafe input', () => {
    const onSave = vi.fn();
    const bot = { ...emptyBotProfile('00000000-0000-4000-8000-000000000001'), displayName: 'Anita', runtimeId: 'anita', fileName: 'anita.txt', mission: 'Rédiger' };
    render(<BotEditor isOpen bot={bot} onClose={vi.fn()} onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'URL du portrait' });
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'https://images.example.org/anita.png' } });
    expect(screen.getByRole('img', { name: 'Portrait de Anita' })).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'https://images.example.org/anita.png' }));
});
