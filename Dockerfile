FROM oven/bun:1 AS base
WORKDIR /app

# Installation des dépendances
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install

# Installation des dépendances des modules
COPY modules/ ./modules/
RUN for dir in modules/*/; do \
      if [ -f "$dir/package.json" ]; then \
        cd "$dir" && bun install && cd /app; \
      fi; \
    done

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/modules ./modules
COPY . .
RUN bun run build

# Production
FROM base AS runner

# Créer les dossiers nécessaires et définir les permissions
RUN mkdir -p /app/.next/static \
    /app/uploads \
    /app/uploads/thumbnails \
    /app/data \
    /app/config && \
    chmod 777 /app/uploads \
    /app/uploads/thumbnails \
    /app/data \
    /app/config

# Copier les fichiers nécessaires
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Définition des variables d'environnement
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Définir les volumes
VOLUME ["/app/uploads", "/app/config", "/app/data"]

# Créer le dossier cache et définir les permissions
RUN mkdir -p .next/cache && chown -R 1000:1000 .next

CMD ["bun", "server.js"]