import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OriginButton } from './OriginButton';

/**
 * Ces tests verrouillent les trois décisions qui ont motivé le composant.
 * Chacun échouerait sur le `Button.jsx` du kit UI tel quel.
 */

describe('OriginButton', () => {
    it('porte la classe de forme de la marque', () => {
        // La forme signature (12px 12px 3px 12px) est composée par
        // `.origin-button`. Le kit UI pose une gélule à la place, ce qui
        // contredit sa propre règle : c'est le motif de cet écart.
        render(<OriginButton>Exporter</OriginButton>);
        expect(screen.getByRole('button', { name: 'Exporter' })).toHaveClass('origin-button');
    });

    it('vaut type="button" par défaut', () => {
        // Sans ce défaut, un bouton d'action placé dans un formulaire le
        // soumettrait. Le kit ne transmet pas `type` du tout.
        render(<OriginButton>Importer</OriginButton>);
        expect(screen.getByRole('button', { name: 'Importer' })).toHaveAttribute('type', 'button');
    });

    it('laisse surcharger type quand la soumission est voulue', () => {
        render(<OriginButton type="submit">Envoyer</OriginButton>);
        expect(screen.getByRole('button', { name: 'Envoyer' })).toHaveAttribute('type', 'submit');
    });

    it('transmet les attributs natifs — title, aria et disabled', () => {
        // Le kit n'expose que onClick/disabled : `title` et `aria-*`
        // disparaîtraient, et avec eux l'infobulle et l'accessibilité.
        const onClick = vi.fn();
        render(
            <OriginButton title="Exporter en PDF" aria-label="Export PDF" disabled onClick={onClick}>
                PDF
            </OriginButton>,
        );
        const bouton = screen.getByRole('button', { name: 'Export PDF' });
        expect(bouton).toHaveAttribute('title', 'Exporter en PDF');
        expect(bouton).toBeDisabled();

        fireEvent.click(bouton);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('applique la variante demandée sans perdre les classes appelantes', () => {
        render(
            <OriginButton variant="destructive" size="sm" className="uppercase">
                Supprimer
            </OriginButton>,
        );
        const bouton = screen.getByRole('button', { name: 'Supprimer' });
        expect(bouton).toHaveClass('origin-button', 'uppercase');
        expect(bouton.style.color).toContain('--system-red');
    });
});
