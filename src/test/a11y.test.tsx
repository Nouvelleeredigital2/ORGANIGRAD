import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { BaseModal } from '../components/BaseModal';
import { Button, FormField, Input } from '../design/ui';

/**
 * Tests d'accessibilité automatisés (Phase 9) via axe-core.
 * On vérifie l'absence de violations sur les primitives et la modale partagée.
 * (Le contraste de couleur n'est pas calculable en jsdom : axe le marque
 * "incomplete", pas "violation".)
 */
describe('accessibilité (axe-core)', () => {
    it('un formulaire (FormField + Input + Button) n\'a pas de violation', async () => {
        const { container } = render(
            <form aria-label="Profil">
                <FormField label="Nom">
                    <Input defaultValue="Camille" />
                </FormField>
                <FormField label="Rôle">
                    <Input defaultValue="Directrice" />
                </FormField>
                <Button>Enregistrer</Button>
            </form>,
        );
        const results = await axe(container);
        expect(results.violations).toEqual([]);
    });

    it('la modale partagée (BaseModal) n\'a pas de violation', async () => {
        const { container } = render(
            <BaseModal isOpen title="Détails du nœud" onClose={() => {}}>
                <p>Contenu de la modale.</p>
                <Button>Action</Button>
            </BaseModal>,
        );
        const results = await axe(container);
        expect(results.violations).toEqual([]);
    });
});
