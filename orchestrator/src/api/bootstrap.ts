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
import { registerVoiceGatewayRoutes } from './voiceGateway.js';
import { createSynapseProducer } from '../synapse/producer.js';
import { getSql } from '../state/pgGraphStore.js';
import { loadEnv } from '../config/env.js';
import { createSupabaseJwtVerifier } from './userAuth.js';
import { pathToFileURL } from 'node:url';
import { PgCircuitScheduler } from '../state/pgCircuitScheduler.js';
import { registerCircuitWorker } from './circuitWorker.js';
import { loadLinkBridgeConfig } from './linkBridgeConfig.js';
import { createOrvionServiceClient, readOrvionMandateFile } from '../integrations/orvionServiceClient.js';
import { createEngineTaskClient } from '../integrations/engineTaskClient.js';
import { readFileSync } from 'node:fs';

export async function startOrchestrator() {
    // Validation centralisée — échoue tôt avec un message clair si config invalide.
    const env = loadEnv();
    const port = env.port;
    const appUrl = env.appUrl;

    if (env.mode === 'pg') {
        const sql = getSql();
        // Sessions humaines : HS256 (secret partagé legacy) et/ou ES256 (JWKS —
        // projets migrés vers les « JWT signing keys »). Sans l'un ni l'autre,
        // seules les clés API `ok_…` sont acceptées.
        const verifyUserToken =
            env.supabaseJwtSecret || env.supabaseJwksUrl
                ? createSupabaseJwtVerifier({
                      secret: env.supabaseJwtSecret,
                      jwksUrl: env.supabaseJwksUrl,
                  })
                : undefined;
        // Livraison Orvion sous reçu : le mandat est lu depuis un fichier au démarrage et n'est
        // jamais journalisé ; toute configuration incomplète fait échouer le démarrage.
        const circuitDelivery = env.circuitDeliveryEnabled ? {
            orvion: createOrvionServiceClient({
                baseUrl: env.orvionBaseUrl ?? '', qualifiedOrigin: env.orvionQualifiedOrigin ?? '',
                mandateId: readOrvionMandateFile(env.orvionServiceMandateFile ?? ''),
                originHeader: new URL(appUrl ?? '').origin,
            }),
            // Génération Engine : clé API lue depuis un fichier au démarrage, jamais journalisée.
            engine: env.engineGenerationEnabled ? {
                client: createEngineTaskClient({ baseUrl: env.engineBaseUrl ?? '', qualifiedOrigin: env.engineQualifiedOrigin ?? '', apiKey: readFileSync(env.engineApiKeyFile ?? '', 'utf8').trim() }),
                engineId: env.engineId ?? '',
            } : undefined,
        } : undefined;
        const app = buildPgServer({
            sql,
            circuitDelivery,
            projectsEnabled: env.projectsEnabled,
            circuitsEnabled: env.circuitsEnabled,
            projectServiceDelegationsEnabled: env.projectServiceDelegationsEnabled,
            privateProjectsEnabled: env.privateProjectsEnabled,
            privateProjectsIssuer: env.privateProjectsIssuer,
            privateProjectsVerifyUserToken: env.privateProjectsEnabled ? createSupabaseJwtVerifier({
                secret: env.supabaseJwtSecret,
                jwksUrl: env.supabaseJwksUrl,
                fetchImpl: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4500) }),
            }) : undefined,
            allowedOrigins: env.corsAllowedOrigins,
            jwtSecret: env.supabaseJwtSecret,
            verifyUserToken,
            linkBaseUrl: env.linkBaseUrl,
            linkBridgeToken: env.linkBridgeToken,
            // Pont LINK ↔ hub : lecture des clés au démarrage, échec explicite
            // si LINK_BRIDGE_ENABLED=1 et qu'un fichier est absent ou invalide.
            linkBridge: loadLinkBridgeConfig(env),
            notifierOptions: {
                validationsWebhook: env.slackValidations,
                fluxWebhook: env.slackFlux,
                appUrl,
                sqlForAudit: sql,
                emailEdgeFunctionUrl: env.emailEdgeFunctionUrl,
                supabaseServiceRoleKey: env.supabaseServiceRoleKey,
            },
        });
        // Consommation du bus APPS-2026 en production — DÉSACTIVÉE PAR DÉFAUT.
        // Le producteur, lui, est déjà câblé côté pgServer (hop 1 via le moteur,
        // hop 5 sur approve/reject) : Organigrad PARLE déjà sur le bus, il n'y
        // ÉCOUTE pas encore. Activer avec SYNAPSE_CONSUMER=1.
        // Prérequis avant activation durable : cloisonner la file du consumer par
        // workspace (cf. avertissement en tête de synapse/consumer.ts).
        // Proxy vocal (SDK @apps2026/voice-client) — 503 tant que le gateway
        // n'est pas configuré (NED_VOICE_GATEWAY_URL / NED_VOICE_GATEWAY_TOKEN).
        registerVoiceGatewayRoutes(app);
        if(env.circuitSchedulerEnabled) {
            registerCircuitWorker(app,new PgCircuitScheduler(sql,env.circuitSchedulerProjectIds));
        }
        if (process.env.SYNAPSE_CONSUMER === '1') {
            registerSynapseConsumer(app);
            console.log('[orchestrator] consumer Synapse ACTIF (mode pg)');
        }
        await app.listen({ port, host: env.listenHost });
        console.log(`[orchestrator] mode Postgres + API key sur ${env.listenHost}:${port}`);
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
    // Proxy vocal (SDK @apps2026/voice-client) — même patron qu'en mode pg.
    registerVoiceGatewayRoutes(app);
    await app.listen({ port, host: env.listenHost });
    console.log(`[orchestrator] mode in-memory sur ${env.listenHost}:${port}`);
    return { app, store, engine, notifier, mode: 'memory' as const };
}

// pathToFileURL normalise correctement (encodage %20, 2 vs 3 slashes) — la
// reconstruction manuelle précédente échouait sur tout chemin avec espace
// (ex. Windows "...\5070 Ti\...") : startOrchestrator() n'était jamais
// appelé, le process restait vivant sans jamais écouter de port. Incident
// réel du 09/08 (banc E2E local).
const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry || process.env.ORCHESTRATOR_AUTOSTART === '1') {
    startOrchestrator().catch((err) => {
        console.error('[orchestrator] échec démarrage', err);
        process.exit(1);
    });
}
