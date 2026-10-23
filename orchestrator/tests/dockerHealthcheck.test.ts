import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dockerfileUrl = new URL('../Dockerfile', import.meta.url);

describe('image Docker de l\'orchestrateur', () => {
    it('sonde la route publique /healthz exposée par le serveur', async () => {
        const dockerfile = await readFile(fileURLToPath(dockerfileUrl), 'utf8');

        expect(dockerfile).toContain('http://127.0.0.1:${PORT}/healthz');
        expect(dockerfile).not.toContain('http://localhost:${PORT}/health"');
        // Dans un conteneur, localhost résout d'abord en IPv6 alors que le serveur n'écoute
        // qu'en IPv4 : la sonde échouait sur un service sain (audit 22/10, tâche 0.8).
        expect(dockerfile).not.toContain('http://localhost:${PORT}/healthz');
    });
});
