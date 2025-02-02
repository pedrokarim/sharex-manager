FROM oven/bun:1 AS base
WORKDIR /app

# Installation des dépendances
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production
FROM base AS runner

# Créer les dossiers nécessaires
RUN mkdir -p /app/.next/static /app/uploads /app/config

# Copier les fichiers nécessaires
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Définition des variables d'environnement
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Exposition du port (sera écrasé par docker-compose)
EXPOSE 3000

# Définir les volumes
VOLUME ["/app/uploads", "/app/config"]

CMD ["bun", "server.js"] 