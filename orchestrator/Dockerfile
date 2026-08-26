# =============================================================================
# Organigrad — orchestrateur Fastify (@organigrad/orchestrator)
# Stack : Node 20 / TypeScript / Fastify 5 / postgres. Multi-stage (build → run).
# Entrée : dist/src/api/bootstrap.js (script "start"). Port : 3001 (via PORT).
# Healthcheck public exposé par le serveur : GET /healthz.
#    Si l'orchestrateur fait partie d'un workspace npm, builder depuis la racine
#    du repo avec --filter plutôt que ce contexte local.
# =============================================================================

# ── Stage 1 : build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY vendor/ ./vendor/
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ── Stage 2 : runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package*.json ./
COPY vendor/ ./vendor/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/healthz" || exit 1

CMD ["node", "dist/src/api/bootstrap.js"]
