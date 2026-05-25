/**
 * Bootstrap orchestrateur — choisit le backend selon l'environnement :
 *   - SUPABASE_DB_URL défini  → mode Postgres + auth API key (production)
 *   - sinon                    → mode in-memory (tests, dev local sans DB)
 */
import { GraphStore } from '../state/graphStore.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { McpClient } from '../mcp/mcpClient.js';
import { Notifier, PgAuditLogger } from '../observability/notifier.js';
import { buildServer } from './server.js';
import { buildPgServer } from './pgServer.js';
import { getSql } from '../state/pgGraphStore.js';

export async function startOrchestrator(port = Number(process.env.PORT ?? 3001)) {
    const pgMode = Boolean(process.env.SUPABASE_DB_URL);
    const appUrl = process.env.APP_URL ?? undefined;

    if (pgMode) {
        const sql = getSql();
        const app = buildPgServer({
            sql,
            notifierOptions: {
                validationsWebhook: process.env.SLACK_VALIDATIONS ?? undefined,
                fluxWebhook: process.env.SLACK_FLUX ?? undefined,
                appUrl,
                sqlForAudit: sql,
                emailEdgeFunctionUrl: process.env.EMAIL_EDGE_FUNCTION_URL ?? undefined,
                supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? undefined,
            },
        });
        await app.listen({ port, host: '0.0.0.0' });
        console.log(`[orchestrator] mode Postgres + API key sur http://0.0.0.0:${port}`);
        return { app, mode: 'pg' as const };
    }

    // Mode in-memory (test/dev) — pas d'auth, store en RAM.
    const store = new GraphStore();
    store.load([]);

    const mcpClient = new McpClient({ timeoutMs: 30_000 });
    const engine = new OrchestrationEngine(store, mcpClient);

    // En mode mémoire, on n'a pas de workspace DB — l'audit SQL est optionnel.
    const notifier = new Notifier({
        store,
        validationsWebhook: process.env.SLACK_VALIDATIONS ?? undefined,
        fluxWebhook: process.env.SLACK_FLUX ?? undefined,
        appUrl,
        emailEdgeFunctionUrl: process.env.EMAIL_EDGE_FUNCTION_URL ?? undefined,
        supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? undefined,
    });
    notifier.attach();

    const app = buildServer({ store, engine });
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`[orchestrator] mode in-memory sur http://0.0.0.0:${port}`);
    return { app, store, engine, notifier, mode: 'memory' as const };
}

const isEntry = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isEntry || process.env.ORCHESTRATOR_AUTOSTART === '1') {
    startOrchestrator().catch((err) => {
        console.error('[orchestrator] échec démarrage', err);
        process.exit(1);
    });
}
