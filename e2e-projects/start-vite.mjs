import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// No repository config or .env files: only these explicit test values reach Vite.
for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_')) delete process.env[key];
}
Object.assign(process.env, {
    NODE_ENV: 'test',
    VITE_PROJECTS_ENABLED: 'true',
    VITE_SUPABASE_URL: 'http://127.0.0.1:5174/__test_supabase',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_TEST_SYNapse_dummy_not_a_key',
    VITE_ORCHESTRATOR_URL: '',
});

const server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: false,
    envFile: false,
    envDir: false,
    mode: 'test',
    plugins: [react()],
    // Isolate Vite's generated cache from the frontend agent's development server.
    cacheDir: 'e2e-projects/test-results/.vite',
    server: { host: '127.0.0.1', port: 5174, strictPort: true, hmr: false, open: false },
});
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await server.close(); process.exit(0); });
}
await server.listen();
server.printUrls();
