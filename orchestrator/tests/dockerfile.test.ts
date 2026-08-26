import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readDockerFile = (name: string): string => readFileSync(resolve(process.cwd(), name), 'utf8');

describe('contrat de construction Docker', () => {
    it('installe les dépendances vendorisées avec le lockfile avant les sources', () => {
        const dockerfile = readDockerFile('Dockerfile');
        const vendorCopy = dockerfile.indexOf('COPY vendor/ ./vendor/');
        const install = dockerfile.indexOf('RUN npm ci --ignore-scripts');
        const sourceCopy = dockerfile.indexOf('COPY . .');

        expect(vendorCopy).toBeGreaterThan(-1);
        expect(install).toBeGreaterThan(vendorCopy);
        expect(sourceCopy).toBeGreaterThan(install);
        expect(dockerfile).not.toContain('RUN npm install');
    });

    it('exclut secrets et artefacts du contexte Docker', () => {
        const dockerignore = readDockerFile('.dockerignore');

        expect(dockerignore).toContain('.env');
        expect(dockerignore).toContain('.env.*');
        expect(dockerignore).toContain('node_modules');
        expect(dockerignore).toContain('dist');
    });

    it('démarre le fichier réellement émis par TypeScript', () => {
        const dockerfile = readDockerFile('Dockerfile');
        const packageJson = JSON.parse(readDockerFile('package.json')) as { scripts: { start: string } };

        expect(packageJson.scripts.start).toBe('node dist/src/api/bootstrap.js');
        expect(dockerfile).toContain('CMD ["node", "dist/src/api/bootstrap.js"]');
    });
});
