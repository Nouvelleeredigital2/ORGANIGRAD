import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['./tests/setup.ts'],
        testTimeout: 10000,
        // Several suites open independent PGlite instances. Running the files at
        // once makes otherwise deterministic database tests exceed their timeout
        // on a contended local filesystem.
        fileParallelism: false,
    },
});
