import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseModal } from './BaseModal';

describe('BaseModal — accessibilité (Priorité 11)', () => {
    it('expose role="dialog" + aria-modal + titre relié', () => {
        render(
            <BaseModal isOpen title="Mon titre" onClose={() => {}}>
                <button>Action</button>
            </BaseModal>,
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        // aria-labelledby pointe vers le <h2> du titre
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        expect(document.getElementById(labelledBy!)?.textContent).toBe('Mon titre');
    });

    it('déplace le focus à l\'intérieur de la modale à l\'ouverture', () => {
        render(
            <BaseModal isOpen title="T" onClose={() => {}}>
                <button>Premier</button>
            </BaseModal>,
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('ferme sur Échap', () => {
        const onClose = vi.fn();
        render(
            <BaseModal isOpen title="T" onClose={onClose}>
                <span>contenu</span>
            </BaseModal>,
        );
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('le bouton de fermeture a un nom accessible', () => {
        render(
            <BaseModal isOpen title="T" onClose={() => {}}>
                <span>contenu</span>
            </BaseModal>,
        );
        expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    });
});
