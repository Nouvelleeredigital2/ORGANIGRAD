import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './routes.js';
import type { GraphStore } from '../state/graphStore.js';
import type { OrchestrationEngine } from '../orchestration/engine.js';

export interface ServerDeps {
    store: GraphStore;
    engine: OrchestrationEngine;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
    const app = Fastify({ logger: false });
    registerRoutes(app, deps);
    return app;
}
