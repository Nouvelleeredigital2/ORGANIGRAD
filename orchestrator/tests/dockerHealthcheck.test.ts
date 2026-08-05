import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dockerfileUrl = new URL('../Dockerfile', import.meta.url);

describe('image Docker de l\'orchestrateur', () => {
    it('sonde la route publique /healthz exposée par le serveur', async () => {
        const dockerfile = await readFile(fileURLToPath(dockerfileUrl), 'utf8');

        expect(dockerfile).toContain('http://localhost:${PORT}/healthz');
        expect(dockerfile).not.toContain('http://localhost:${PORT}/health"');
    });
});
