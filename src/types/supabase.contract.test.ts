/**
 * Le contrat écrit à la main (`supabase.ts`) ne doit nommer que ce qui existe en base.
 *
 * `database.generated.ts` est généré depuis la base réelle (Lot 1.4 de l'audit du 22/10).
 * Les vérifications ci-dessous sont faites par le COMPILATEUR (`npm run typecheck`) :
 * une table, une vue, une colonne ou une RPC du contrat manuel absente des types
 * générés fait échouer la compilation, pas seulement ce test.
 */
import { describe, expect, it } from 'vitest';
import type { Database as Manuel } from './supabase';
import type { Database as Genere } from './database.generated';

type M = Manuel['public'];
type G = Genere['public'];

/** Les clés de A absentes de B (`never` si aucune). */
type EnTrop<A, B> = Exclude<keyof A, keyof B>;

/**
 * Ne compile que si T est exactement `never`. Une simple affectation `const x: T = true`
 * ne suffirait pas : `true` reste assignable à une union `true | 'colonne_absente'`.
 */
type Aucun<T extends never> = T;

type ColonnesEnTrop = {
    [T in keyof M['Tables'] & keyof G['Tables']]: EnTrop<M['Tables'][T]['Row'], G['Tables'][T]['Row']>;
}[keyof M['Tables'] & keyof G['Tables']];

type ColonnesVueEnTrop = {
    [V in keyof M['Views'] & keyof G['Views']]: EnTrop<M['Views'][V]['Row'], G['Views'][V]['Row']>;
}[keyof M['Views'] & keyof G['Views']];

export type ContratSupabase = [
    Aucun<EnTrop<M['Tables'], G['Tables']>>,
    Aucun<EnTrop<M['Views'], G['Views']>>,
    Aucun<EnTrop<M['Functions'], G['Functions']>>,
    Aucun<ColonnesEnTrop>,
    Aucun<ColonnesVueEnTrop>,
];

describe('contrat Supabase manuel', () => {
    it('ne nomme que des tables, vues, colonnes et RPC présentes dans les types générés', () => {
        // La preuve est la compilation de `ContratSupabase` ; ce test la rattache à la suite.
        const verifie: ContratSupabase | null = null;
        expect(verifie).toBeNull();
    });
});
