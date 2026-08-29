# ── Stage 1 : build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Installer les dépendances (layer cachée si package.json inchangé)
COPY package*.json ./
# Le verrou declare une dependance VENDOREE (file:vendor/*.tgz) : sans cette
# copie AVANT `npm ci`, l'installation echoue en ENOENT. Le contrat partage
# n'est pas publie sur un registre — piege documente en CLAUDE.md §14.
COPY vendor/ ./vendor/
RUN npm ci --ignore-scripts

# Copier les sources et builder
COPY . .
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
