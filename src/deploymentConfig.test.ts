import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('configuration de production', () => {
    it('applique les en-têtes de sécurité aussi aux assets versionnés', () => {
        const nginx = readProjectFile('nginx.conf');
        const assetsStart = nginx.indexOf('location /assets/ {');
        const assetsEnd = nginx.indexOf('\n    }', assetsStart);
        const assets = nginx.slice(assetsStart, assetsEnd);

        expect(assets).toContain('X-Content-Type-Options');
        expect(assets).toContain('X-Frame-Options');
        expect(assets).toContain('Referrer-Policy');
        expect(assets).toContain('Content-Security-Policy');
    });

    it('sépare les moteurs PDF pour garder les chunks sous le seuil Vite', () => {
        const vite = readProjectFile('vite.config.ts');

        expect(vite).toContain("if (id.includes('jspdf')) return 'vendor-jspdf'");
        expect(vite).toContain("if (id.includes('html2canvas')) return 'vendor-html2canvas'");
        expect(vite).not.toContain("if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf'");
    });
});
