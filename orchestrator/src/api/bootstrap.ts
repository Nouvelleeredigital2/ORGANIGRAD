/**
 * Bootstrap orchestrateur — choisit le backend selon l'environnement :
 *   - SUPABASE_DB_URL défini  → mode Postgres + auth API key (production)
 *   - sinon                    → mode in-memory (tests, dev local sans DB)
 */
import { InMemoryGraphStore } from '../state/graphStore.js';
import { OrchestrationEngine } from '../orchestration/engine.js';
import { McpClient } from '../mcp/mcpClient.js';
import { Notifier } from '../observability/notifier.js';
import { buildServer } from './server.js';
import { buildPgServer } from './pgServer.js';
import { registerSynapseConsumer } from '../synapse/consumer.js';
import { createSynapseProducer } from '../synapse/producer.js';
import { getSql } from '../state/pgGraphStore.js';
import { loadEnv } from '../config/env.js';

export async function startOrchestrator() {
    // Validation centralisée — échoue tôt avec un message clair si config invalide.
    const env = loadEnv();
    const port = env.port;
    const appUrl = env.appUrl;

    if (env.mode === 'pg') {
        const sql = getSql();
        const app = buildPgServer({
            sql,
            allowedOrigins: env.corsAllowedOrigins,
            jwtSecret: env.supabaseJwtSecret,
            notifierOptions: {
                validationsWebhook: env.slackValidations,
                fluxWebhook: env.slackFlux,
                appUrl,
                sqlForAudit: sql,
                emailEdgeFunctionUrl: env.emailEdgeFunctionUrl,
                supabaseServiceRoleKey: env.supabaseServiceRoleKey,
            },
        });
        await app.listen({ port, host: '0.0.0.0' });
        console.log(`[orchestrator] mode Postgres + API key sur http://0.0.0.0:${port}`);
        return { app, mode: 'pg' as const };
    }

    // Mode in-memory (test/dev) — pas d'auth, store en RAM.
    const store = new InMemoryGraphStore();
    store.load([]);

    const mcpClient = new McpClient({ timeoutMs: 30_000 });
    // Producteur de bus APPS-2026 : émet `validation.requested` au nœud HUMAN.
    // Auto-inactif si SYNAPSE_URL absent. Symétrique du consumer ci-dessous.
    const synapseProducer = createSynapseProducer({ appUrl });
    const engine = new OrchestrationEngine(store, mcpClient, synapseProducer);

    // En mode mémoire, on n'a pas de workspace DB — l'audit SQL est optionnel.
    const notifier = new Notifier({
        store,
        validationsWebhook: env.slackValidations,
        fluxWebhook: env.slackFlux,
        appUrl,
        emailEdgeFunctionUrl: env.emailEdgeFunctionUrl,
        supabaseServiceRoleKey: env.supabaseServiceRoleKey,
    });
    notifier.attach();

    const app = buildServer({ store, engine });
    // Participation au bus APPS-2026 (consomme validation.requested, ré-émet la
    // décision). Auto-inactif si SYNAPSE_URL absent. Dev/in-memory uniquement.
    registerSynapseConsumer(app);
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
