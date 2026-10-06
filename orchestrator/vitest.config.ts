import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['./tests/setup.ts'],
        // Les suites SQL PGlite sont gourmandes en mémoire et CPU. Leur
        // parallélisation provoquait des timeouts sans échec fonctionnel.
        maxWorkers: 1,
        testTimeout: 10000,
    },
});
