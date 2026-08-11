import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HybridNode } from '../types/hybridNode';
import type { Database } from '../types/supabase';

type Row = Database['public']['Tables']['hybrid_nodes']['Row'];

/**
 * Reproduit fidèlement le piège de `@supabase/realtime-js` : `.channel(topic)`
 * renvoie l'instance EXISTANTE pour un topic déjà enregistré (pas une
 * nouvelle) — d'où le crash réel si deux appelants s'abonnent au même
 * workspace sans coordination (cf. jsdoc de `hybridNodeRepo.subscribe`).
 * `vi.hoisted` : `vi.mock` ci-dessous est hissé au-dessus des imports, la
 * factory ne peut référencer que des variables déclarées de la même façon.
 */
const { mockSupabase, mockRegistry } = vi.hoisted(() => {
    class FakeChannel {
        topic: string;
        handler: ((payload: unknown) => void) | null = null;
        isSubscribed = false;
        constructor(topic: string) {
            this.topic = topic;
        }
        on(_event: string, _filter: unknown, handler: (payload: unknown) => void) {
            if (this.isSubscribed) {
                throw new Error(
                    `cannot add \`postgres_changes\` callbacks for realtime channel \`${this.topic}\` after \`subscribe()\`.`,
                );
            }
            this.handler = handler;
            return this;
        }
        subscribe() {
            this.isSubscribed = true;
            return this;
        }
        emit(payload: unknown) {
            this.handler?.(payload);
        }
    }

    const registry = new Map<string, InstanceType<typeof FakeChannel>>();
    const removeChannel = (channel: InstanceType<typeof FakeChannel>) => {
        registry.delete(channel.topic);
    };
    const client = {
        channel(topic: string) {
            const existing = registry.get(topic);
            if (existing) return existing;
            const channel = new FakeChannel(topic);
            registry.set(topic, channel);
            return channel;
        },
        removeChannel,
    };

    return { mockSupabase: client, mockRegistry: registry, mockRemoveChannel: removeChannel };
});

vi.mock('../lib/supabase', () => ({ supabase: mockSupabase, isSupabaseConfigured: true }));

const { hybridNodeRepo, nodeToInsert, rowToNode } = await import('./hybridNodeRepo');

/**
 * Risque couvert : perte définitive et silencieuse des secrets d'un client.
 *
 * L'orchestrateur chiffre `system_prompt`, `mcp_config` et
 * `notification_channels` au repos. La SPA n'a pas la clé. Si elle matérialise
 * ces valeurs (sentinelle, chaîne factice) puis les réécrit, le prompt système
 * et les webhooks sont détruits — y compris quand l'utilisateur ouvre
 * l'éditeur et enregistre sans rien modifier.
 */

const baseRow: Row = {
    id: 'n1',
    workspace_id: 'ws1',
    type: 'AGENT_IA',
    nom: 'Rédacteur',
    role_titre: 'Génère des textes',
    parent_id: null,
    grade_id: 'Expert',
    system_prompt: null,
    skills: [],
    mcp_config: null,
    notification_channels: null,
    avatar_url: null,
    status: 'IDLE',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
};

describe('rowToNode — champs chiffrés', () => {
    it('signale un champ chiffré sans jamais en matérialiser la valeur', () => {
        const node = rowToNode({
            ...baseRow,
            system_prompt: 'enc:v1:AAAABBBBCCCC',
            mcp_config: 'enc:v1:DDDDEEEE' as unknown as Row['mcp_config'],
            notification_channels: 'enc:v1:FFFFGGGG' as unknown as Row['notification_channels'],
        });

        expect(node.encrypted).toEqual({
            systemPrompt: true,
            mcpConfig: true,
            notificationChannels: true,
        });
        // Aucune valeur factice ne doit circuler jusqu'à l'interface.
        expect(node.systemPrompt).toBeUndefined();
        expect(node.mcpConfig).toBeUndefined();
        expect(node.notificationChannels).toBeUndefined();
        expect(JSON.stringify(node)).not.toContain('__encrypted__');
        expect(JSON.stringify(node)).not.toContain('enc:v1:');
    });

    it('laisse passer une valeur en clair et ne pose aucun drapeau', () => {
        const node = rowToNode({ ...baseRow, system_prompt: 'Tu es un expert.' });

        expect(node.systemPrompt).toBe('Tu es un expert.');
        expect(node.encrypted).toBeUndefined();
    });
});

describe('nodeToInsert — omission = conservation', () => {
    const encryptedNode: HybridNode = {
        id: 'n1',
        type: 'AGENT_IA',
        nom: 'Rédacteur',
        roleTitre: 'Génère des textes',
        parentID: null,
        gradeId: 'Expert',
        status: 'IDLE',
        encrypted: { systemPrompt: true, notificationChannels: true },
    };

    it('omet les colonnes chiffrées non remplacées', () => {
        const payload = nodeToInsert(encryptedNode, 'ws1');

        // Une colonne absente de la charge n'est pas touchée par l'upsert.
        expect('system_prompt' in payload).toBe(false);
        expect('notification_channels' in payload).toBe(false);
        // Le champ non chiffré reste écrit normalement.
        expect('mcp_config' in payload).toBe(true);
        expect(payload.nom).toBe('Rédacteur');
    });

    it('écrit la colonne dès que le champ a été remplacé', () => {
        // Remplacement : l'éditeur retire le drapeau et fournit la valeur.
        const replaced: HybridNode = {
            ...encryptedNode,
            systemPrompt: 'Nouveau prompt.',
            encrypted: { notificationChannels: true },
        };
        const payload = nodeToInsert(replaced, 'ws1');

        expect(payload.system_prompt).toBe('Nouveau prompt.');
        expect('notification_channels' in payload).toBe(false);
    });

    it('écrit toutes les colonnes pour un nœud sans champ chiffré', () => {
        const plain: HybridNode = { ...encryptedNode, encrypted: undefined, systemPrompt: 'Clair.' };
        const payload = nodeToInsert(plain, 'ws1');

        expect(payload.system_prompt).toBe('Clair.');
        expect('mcp_config' in payload).toBe(true);
        expect('notification_channels' in payload).toBe(true);
    });
});

/**
 * Risque couvert : crash total de la SPA (exception non rattrapée, page
 * blanche) constaté en recette connectée le 2026-08-11. ActivityLog et
 * OrchestrationView s'abonnent tous deux au même workspace ; `.channel(topic)`
 * de supabase-js renvoie l'instance EXISTANTE pour un topic déjà enregistré,
 * et un second `.on('postgres_changes', …)` sur un channel déjà `.subscribe()`
 * lève. Ouvrir l'onglet Orchestration plantait donc systématiquement l'app
 * dès qu'ActivityLog était déjà monté (cas réel du workspace de production).
 */
describe('subscribe — deux abonnés sur le même workspace', () => {
    // Le registre interne de hybridNodeRepo (module-level) survit entre tests
    // — seul un désabonnement explicite le vide. Sans ce nettoyage, un test
    // suivant réutilise silencieusement l'entrée laissée par le précédent.
    const cleanups: Array<() => void> = [];
    const trackedSubscribe: typeof hybridNodeRepo.subscribe = (ctx, handler) => {
        const off = hybridNodeRepo.subscribe(ctx, handler);
        cleanups.push(off);
        return off;
    };

    afterEach(() => {
        cleanups.splice(0).forEach((off) => off());
        mockRegistry.clear();
    });

    it("ne lève pas quand un second abonné rejoint le même workspace (le vrai crash reproduit)", () => {
        const handlerA = vi.fn();
        const handlerB = vi.fn();

        expect(() => {
            trackedSubscribe({ workspaceId: 'ws1' }, handlerA);
        }).not.toThrow();
        expect(() => {
            trackedSubscribe({ workspaceId: 'ws1' }, handlerB);
        }).not.toThrow();
    });

    it('diffuse un même événement à tous les abonnés du workspace', () => {
        const handlerA = vi.fn();
        const handlerB = vi.fn();
        trackedSubscribe({ workspaceId: 'ws1' }, handlerA);
        trackedSubscribe({ workspaceId: 'ws1' }, handlerB);

        const channel = mockRegistry.get('hybrid_nodes:ws1')!;
        channel.emit({ eventType: 'INSERT', new: { ...baseRow, id: 'n2' } });

        expect(handlerA).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'n2' }));
        expect(handlerB).toHaveBeenCalledWith('INSERT', expect.objectContaining({ id: 'n2' }));
    });

    it("ferme le channel seulement quand le dernier abonné se désabonne", () => {
        const offA = trackedSubscribe({ workspaceId: 'ws1' }, vi.fn());
        const offB = trackedSubscribe({ workspaceId: 'ws1' }, vi.fn());

        offA();
        expect(mockRegistry.has('hybrid_nodes:ws1')).toBe(true); // B encore abonné

        offB();
        expect(mockRegistry.has('hybrid_nodes:ws1')).toBe(false);
    });

    it("isole les workspaces : un channel par workspace, pas de fuite d'événements", () => {
        const handlerWs1 = vi.fn();
        const handlerWs2 = vi.fn();
        trackedSubscribe({ workspaceId: 'ws1' }, handlerWs1);
        trackedSubscribe({ workspaceId: 'ws2' }, handlerWs2);

        mockRegistry
            .get('hybrid_nodes:ws2')!
            .emit({ eventType: 'INSERT', new: { ...baseRow, id: 'n3', workspace_id: 'ws2' } });

        expect(handlerWs2).toHaveBeenCalledTimes(1);
        expect(handlerWs1).not.toHaveBeenCalled();
    });
});
