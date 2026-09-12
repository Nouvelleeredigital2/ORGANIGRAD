import { describe, it, expect } from 'vitest';
import { formatRelatif, estFrais, SEUIL_FRAICHEUR_MS } from './tempsRelatif';

const T0 = Date.parse('2026-09-12T12:00:00.000Z');
const ilYA = (ms: number) => new Date(T0 - ms).toISOString();

describe('formatRelatif', () => {
    it('rend les paliers en français', () => {
        expect(formatRelatif(ilYA(30_000), T0)).toBe("à l'instant");
        expect(formatRelatif(ilYA(5 * 60_000), T0)).toBe('il y a 5 min');
        expect(formatRelatif(ilYA(3 * 3_600_000), T0)).toBe('il y a 3 h');
        expect(formatRelatif(ilYA(2 * 86_400_000), T0)).toBe('il y a 2 j');
        expect(formatRelatif(ilYA(9 * 86_400_000), T0)).toBe('il y a 1 sem');
    });

    it('bascule sur une date absolue au-delà de quelques semaines', () => {
        // Un « il y a 43 sem » ne se lit pas : au-delà, une date vaut mieux.
        expect(formatRelatif(ilYA(300 * 86_400_000), T0)).toMatch(/2025/);
    });

    /**
     * Risque couvert : afficher « il y a -3 min ». Les horloges du poste et du
     * serveur ne sont pas synchronisées, une date de relevé légèrement future
     * est donc normale et ne doit pas produire un libellé absurde.
     */
    it('ramène une date future à « à l’instant »', () => {
        expect(formatRelatif(new Date(T0 + 120_000).toISOString(), T0)).toBe("à l'instant");
    });

    it('rend null sur une entrée inexploitable plutôt qu’« Invalid Date »', () => {
        expect(formatRelatif(undefined, T0)).toBeNull();
        expect(formatRelatif('pas une date', T0)).toBeNull();
    });
});

describe('estFrais', () => {
    /**
     * Risque couvert : présenter un relevé ancien comme l'état courant. C'est
     * `estFrais` qui autorise la pastille verte « En ligne » ; s'il est trop
     * permissif, l'interface ment exactement comme le faisait l'affichage
     * qu'on remplace.
     */
    it('accepte une observation récente et refuse une observation périmée', () => {
        expect(estFrais(ilYA(SEUIL_FRAICHEUR_MS - 1_000), T0)).toBe(true);
        expect(estFrais(ilYA(SEUIL_FRAICHEUR_MS + 1_000), T0)).toBe(false);
        expect(estFrais(ilYA(3 * 86_400_000), T0)).toBe(false);
    });

    it("ne considère jamais comme fraîche une date absente ou illisible", () => {
        expect(estFrais(undefined, T0)).toBe(false);
        expect(estFrais('pas une date', T0)).toBe(false);
    });
});
