# ── Stage 1 : build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Installer les dépendances (layer cachée si package.json inchangé)
COPY package*.json ./
COPY vendor/ ./vendor/
RUN npm ci --ignore-scripts

# Copier les sources et builder
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ORCHESTRATOR_URL
ARG VITE_PROJECTS_ENABLED=false
ARG VITE_PRIVATE_PROJECTS_ENABLED=false
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_ORCHESTRATOR_URL=$VITE_ORCHESTRATOR_URL
ENV VITE_PROJECTS_ENABLED=$VITE_PROJECTS_ENABLED
ENV VITE_PRIVATE_PROJECTS_ENABLED=$VITE_PRIVATE_PROJECTS_ENABLED
RUN npm run build

# ── Stage 2 : serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Config nginx SPA (rewrite tout vers index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier le build statique
COPY --from=builder /app/dist /usr/share/nginx/html

# Headers de sécurité + cache assets
# (déjà gérés par nginx.conf ci-dessous)

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
