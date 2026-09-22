import { beforeEach, describe, expect, it } from 'vitest';
import { agentRepo } from './agentRepo';
import { agentStore } from './agentStore';
import type { Agent } from '../types/agent';

/**
 * Les tests s'exécutent hermétiquement (Supabase non configuré) : c'est donc le
 * chemin local qui est couvert. Il n'est pas secondaire — c'est le mode
 * nominal hors-ligne, officiellement supporté.
 */

const agent = (over: Partial<Agent> & { id: string }): Agent => ({
    nom: 'DUPONT',
    prenom: 'Jean',
    fonction: 'Agent',
    titre: '',
    service: 'Voirie',
    pole: 'TECHNIQUE',
    rattachementId: null,
    gradeStyle: 'Agent',
    typeTemps: 'Complet',
    sourceKind: 'import',
    sourceRef: 'fichier-a.csv',
    externalKey: over.id,
    ...over,
});

beforeEach(() => localStorage.clear());

describe('agentRepo — cloisonnement', () => {
    /**
     * Risque couvert : les anciennes clés localStorage étaient GLOBALES. Les
     * fiches d'un workspace fuyaient vers un autre.
     */
    it('ne laisse pas fuir les fiches d’un workspace vers un autre', async () => {
        await agentRepo.upsert(agent({ id: 'a1' }), { workspaceId: null });
        agentStore.save('ws-a', [agent({ id: 'a2', nom: 'MARTIN' })]);

        const autre = await agentRepo.list({ workspaceId: 'ws-b' });
        expect(autre.agents).toEqual([]);

        const local = await agentRepo.list({ workspaceId: null });
        expect(local.agents.map((a) => a.id)).toEqual(['a1']);
    });

    it('signale une lecture locale sans la présenter comme distante', async () => {
        const res = await agentRepo.list({ workspaceId: null });
        expect(res.source).toBe('local');
        // Hors-ligne, le local est nominal : ce n'est pas un cache périmé.
        expect(res.stale).toBe(false);
    });
});

describe('agentRepo — import de masse', () => {
    /**
     * Risque couvert : la contamination inter-sources. Remplacer le contenu
     * d'un fichier ne doit jamais toucher aux fiches d'un autre fichier.
     */
    it('en mode replace, ne retire que les fiches de la MÊME source', async () => {
        agentStore.save(null, [
            agent({ id: 'a-vieux', sourceRef: 'fichier-a.csv' }),
            agent({ id: 'b-intact', sourceRef: 'fichier-b.csv' }),
        ]);

        const res = await agentRepo.bulkUpsert([agent({ id: 'a-neuf' })], { workspaceId: null }, {
            sourceKind: 'import',
            sourceRef: 'fichier-a.csv',
            mode: 'replace',
        });

        const restants = agentStore.list(null).map((a) => a.id).sort();
        expect(restants).toEqual(['a-neuf', 'b-intact']);
        expect(res.deleted).toBe(1);
        expect(res.inserted).toBe(1);
    });

    it('en mode merge, conserve les fiches absentes de la charge', async () => {
        agentStore.save(null, [agent({ id: 'a-vieux' })]);

        await agentRepo.bulkUpsert([agent({ id: 'a-neuf' })], { workspaceId: null }, {
            sourceKind: 'import',
            sourceRef: 'fichier-a.csv',
            mode: 'merge',
        });

        expect(agentStore.list(null).map((a) => a.id).sort()).toEqual(['a-neuf', 'a-vieux']);
    });
});

describe('agentRepo — suppression', () => {
    /**
     * Risque couvert : supprimer un responsable laissait ses subordonnés
     * orphelins, produisant des racines parasites illisibles. La règle locale
     * doit être identique au trigger serveur, sinon l'affichage saute entre
     * l'optimiste et la confirmation.
     */
    it('rattache les subordonnés au grand-parent', async () => {
        agentStore.save(null, [
            agent({ id: 'dg', rattachementId: null }),
            agent({ id: 'chef', rattachementId: 'dg' }),
            agent({ id: 'agent-1', rattachementId: 'chef' }),
            agent({ id: 'agent-2', rattachementId: 'chef' }),
        ]);

        await agentRepo.remove('chef', { workspaceId: null });

        const restants = agentStore.list(null);
        expect(restants.map((a) => a.id).sort()).toEqual(['agent-1', 'agent-2', 'dg']);
        expect(restants.find((a) => a.id === 'agent-1')?.rattachementId).toBe('dg');
        expect(restants.find((a) => a.id === 'agent-2')?.rattachementId).toBe('dg');
    });

    it('fait des subordonnés des racines quand le supprimé était racine', async () => {
        agentStore.save(null, [
            agent({ id: 'dg', rattachementId: null }),
            agent({ id: 'chef', rattachementId: 'dg' }),
        ]);

        await agentRepo.remove('dg', { workspaceId: null });

        expect(agentStore.list(null).find((a) => a.id === 'chef')?.rattachementId).toBeNull();
    });
});
