import { describe, expect, it } from 'vitest';
import { nodeToInsert, rowToNode } from './hybridNodeRepo';
import type { HybridNode } from '../types/hybridNode';
import type { Database } from '../types/supabase';

type Row = Database['public']['Tables']['hybrid_nodes']['Row'];

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
