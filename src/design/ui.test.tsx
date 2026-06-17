import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, Pill, StatusDot } from './ui';
import { cx } from './cx';

describe('design/ui primitives', () => {
    it('cx concatène en ignorant les falsy', () => {
        expect(cx('a', false, undefined, 'b', null, 'c')).toBe('a b c');
    });

    it('Button applique l\'accent système (blue) en solid', () => {
        render(<Button tone="blue">Run</Button>);
        const btn = screen.getByRole('button', { name: 'Run' });
        expect(btn.className).toMatch(/bg-\[var\(--accent\)\]/);
        expect(btn.className).toMatch(/text-white/);
    });

    it('Pill applique un fond doux pour le ton yellow', () => {
        render(<Pill tone="yellow">Validation</Pill>);
        expect(screen.getByText('Validation').className).toMatch(/bg-\[rgba\(255,159,10,0\.1\)\]/);
    });

    it('StatusDot avec label montre le texte de statut', () => {
        render(<StatusDot status="WAITING_HUMAN_APPROVAL" withLabel />);
        expect(screen.getByText(/Validation requise/i)).toBeInTheDocument();
    });

    it('StatusDot EXECUTING active une animation ping', () => {
        const { container } = render(<StatusDot status="EXECUTING" />);
        expect(container.querySelector('.animate-ping')).not.toBeNull();
    });
});
