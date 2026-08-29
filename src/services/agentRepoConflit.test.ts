import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Agent } from '../types/agent';

/**
 * P2-14 — verrou optimiste sur le chemin SPA → Supabase.
 *
 * Les tests d'`agentRepo.test.ts` couvrent le mode local (Supabase non
 * configuré). Ici on force le chemin distant, avec un client factice, pour
 * vérifier ce que la requête demande RÉELLEMENT à PostgREST.
 *
 * Limite honnête : ce n'est pas une preuve de bout en bout — il n'y a pas de
 * PostgREST ici. La preuve comportementale du verrou est côté orchestrateur
 * (`orchestrator/tests/concurrentWrites.integration.test.ts`, PostgreSQL réel).
 * Ces tests-ci verrouillent la FORME de la requête : l'oubli d'un `.eq()` sur
 * le jeton rouvrirait la brèche sans rien casser d'autre.
 */

const appels = vi.hoisted(() => ({
    filtres: [] as Array<[string, unknown]>,
    operation: '' as 'update' | 'upsert' | '',
    /** Lignes que le faux PostgREST renverra après `.select()`. */
    resultat: [] as unknown[],
}));

vi.mock('../lib/supabase', () => {
    const chaine: Record<string, unknown> = {
        update: () => {
            appels.operation = 'update';
            return chaine;
        },
        upsert: () => {
            appels.operation = 'upsert';
            return chaine;
        },
        eq: (col: string, val: unknown) => {
            appels.filtres.push([col, val]);
            return chaine;
        },
        select: () => chaine,
        single: () => Promise.resolve({ data: appels.resultat[0] ?? null, error: null }),
        then: (r: (v: unknown) => unknown) =>
            Promise.resolve({ data: appels.resultat, error: null }).then(r),
    };
    return {
        isSupabaseConfigured: true,
        supabase: { from: () => chaine },
    };
});

const { agentRepo } = await import('./agentRepo');
const { estConflitDeVersion } = await import('./conflitVersion');

const LIGNE = {
    id: 'a1',
    workspace_id: 'ws-1',
    nom: 'DUPONT',
    prenom: 'Jean',
    fonction: 'Agent',
    titre: '',
    service: 'Voirie',
    pole: 'TECHNIQUE',
    rattachement_id: null,
    grade_style: 'Agent',
    type_temps: 'Complet',
    external_key: 'a1',
    source_kind: 'import',
    source_ref: 'f.csv',
    updated_at: '2026-08-22T10:00:00.123456+00:00',
};

const fiche = (over: Partial<Agent> = {}): Agent => ({
    id: 'a1',
    nom: 'DUPONT',
    prenom: 'Jean',
    fonction: 'Agent',
    titre: '',
    service: 'Voirie',
    pole: 'TECHNIQUE',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
    externalKey: 'a1',
    sourceKind: 'import',
    sourceRef: 'f.csv',
    ...over,
});

beforeEach(() => {
    appels.filtres = [];
    appels.operation = '';
    appels.resultat = [LIGNE];
});

describe('agentRepo.upsert — verrou optimiste', () => {
    it('une fiche chargée est écrite via UPDATE gardé par son jeton', async () => {
        await agentRepo.upsert(fiche({ updatedAt: '2026-08-22T10:00:00.123456+00:00' }), {
            workspaceId: 'ws-1',
        });

        expect(appels.operation).toBe('update');
        // Les trois filtres sont indissociables : l'identifiant, le
        // cloisonnement par workspace, et le jeton de version.
        expect(appels.filtres).toEqual([
            ['id', 'a1'],
            ['workspace_id', 'ws-1'],
            ['updated_at', '2026-08-22T10:00:00.123456+00:00'],
        ]);
    });

    it('zéro ligne affectée ⇒ conflit, pas un succès silencieux', async () => {
        appels.resultat = []; // quelqu'un est passé avant

        await expect(
            agentRepo.upsert(fiche({ updatedAt: '2026-08-22T10:00:00.123456+00:00' }), {
                workspaceId: 'ws-1',
            }),
        ).rejects.toSatisfy(estConflitDeVersion);
    });

    it('le message de conflit dit quoi faire et rassure sur la saisie', async () => {
        appels.resultat = [];
        await agentRepo
            .upsert(fiche({ updatedAt: '2026-08-22T10:00:00.123456+00:00' }), { workspaceId: 'ws-1' })
            .catch((err: Error) => {
                expect(err.message).toMatch(/modifiée par quelqu’un d’autre/i);
                expect(err.message).toMatch(/recharge/i);
                expect(err.message).toMatch(/saisie est conservée/i);
            });
    });

    it("une fiche jamais persistée passe par l'upsert, sans garde", async () => {
        // Sinon aucune création ne serait possible : il n'y a pas de jeton à
        // opposer pour une ligne qui n'existe pas encore.
        await agentRepo.upsert(fiche(), { workspaceId: 'ws-1' });

        expect(appels.operation).toBe('upsert');
        expect(appels.filtres).toEqual([]);
    });

    it('la fiche renvoyée porte le jeton à jour', async () => {
        // Faute de quoi l'enregistrement suivant se comparerait à un jeton
        // périmé — un faux conflit contre son propre écrit.
        const enregistree = await agentRepo.upsert(
            fiche({ updatedAt: '2026-08-22T09:00:00.000000+00:00' }),
            { workspaceId: 'ws-1' },
        );
        expect(enregistree.updatedAt).toBe(LIGNE.updated_at);
    });
});
