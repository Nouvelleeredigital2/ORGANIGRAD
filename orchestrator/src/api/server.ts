import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './routes.js';
import type { InMemoryGraphStore } from '../state/graphStore.js';
import type { OrchestrationEngine } from '../orchestration/engine.js';
import { fastifyLoggerOptions, logRouteError } from '../lib/logger.js';

export interface ServerDeps {
    store: InMemoryGraphStore;
    engine: OrchestrationEngine;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
    const app = Fastify({ logger: fastifyLoggerOptions(), disableRequestLogging: true });
    app.addHook('onError', logRouteError);
    registerRoutes(app, deps);
    return app;
}
