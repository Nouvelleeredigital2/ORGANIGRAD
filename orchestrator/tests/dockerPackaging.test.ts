import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const docker = readFileSync(new URL('Dockerfile', root), 'utf8');
const stages = docker.split(/^FROM /m).slice(1);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

describe('orchestrator release packaging', () => {
  it('copies local tarballs before installing dependencies in every stage', () => {
    for (const dependency of Object.values(manifest.dependencies) as string[]) {
      if (dependency.startsWith('file:')) expect(existsSync(new URL(dependency.slice(5), root))).toBe(true);
    }
    expect(stages).toHaveLength(2);
    for (const stage of stages) {
      const install = stage.search(/^RUN npm (?:ci|install)/m);
      const vendor = stage.search(/^COPY vendor\/ \.\/vendor\//m);
      expect(vendor, 'vendor must exist before npm resolves file: dependencies').toBeGreaterThanOrEqual(0);
      expect(vendor).toBeLessThan(install);
    }
  });
  it('installs the committed lockfile, not a newly resolved dependency tree', () => {
    for (const stage of stages) expect(stage).toMatch(/^RUN npm ci\b/m);
  });
  it('starts the entry emitted under rootDir dot', () => {
    const tsconfig = JSON.parse(readFileSync(new URL('tsconfig.json', root), 'utf8'));
    expect(tsconfig.compilerOptions.rootDir).toBe('.');
    expect(docker).toContain('"dist/src/api/bootstrap.js"');
    expect(manifest.scripts.start).toBe('node dist/src/api/bootstrap.js');
    expect(existsSync(fileURLToPath(new URL('src/api/bootstrap.ts', root)))).toBe(true);
  });
});
