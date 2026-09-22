import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    // 0 en local (un échec doit être visible immédiatement) ; 2 en CI, où un
    // runner partagé plus lent peut faire échouer un mock réseau une fois
    // sans que ce soit une régression (cf. bridge-and-uuids.spec.ts).
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5174',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        // Force Supabase OFF en E2E via .env.test → AuthGate transparent.
        command: 'npx vite --port 5174 --mode test',
        url: 'http://localhost:5174',
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
