# Version de Bun ÉPINGLÉE, volontairement.
#
# Le tag flottant `oven/bun:1` est un piège ici : Next 16.3 échoue au build sous
# un Bun antérieur à 1.3.14 avec « Expected CommonJS module to have a function
# wrapper » sur app-page-turbo.runtime.prod.js. Une machine dont le cache
# contient une image plus ancienne produirait donc un build cassé, sans que rien
# n'indique la cause. Toute montée de version se fait ici, sciemment.
ARG BUN_VERSION=1.3.14
FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

# Dépendances applicatives
FROM base AS deps
COPY package.json bun.lock ./
# --frozen-lockfile : le build échoue si le lockfile ne correspond pas au
# package.json, plutôt que de résoudre silencieusement d'autres versions.
RUN bun install --frozen-lockfile

# Dépendances des modules embarqués
COPY modules/ ./modules/
RUN for dir in modules/*/; do \
      if [ -f "$dir/package.json" ]; then \
        (cd "$dir" && bun install); \
      fi; \
    done

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/modules ./modules
COPY . .

# Valeurs de remplacement : Next évalue les variables NEXT_PUBLIC_* à la
# compilation. Les vraies valeurs sont réinjectées à l'exécution par le compose.
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Image d'exécution
FROM base AS runner

RUN mkdir -p /app/.next/static \
    /app/uploads \
    /app/uploads/thumbnails \
    /app/data \
    /app/config && \
    chmod 755 /app/uploads \
    /app/uploads/thumbnails \
    /app/data \
    /app/config && \
    chown -R 1000:1000 /app/uploads /app/data /app/config

# La sortie standalone embarque server.js, proxy.ts et le sous-ensemble de
# node_modules réellement utilisé.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

VOLUME ["/app/uploads", "/app/config", "/app/data"]

RUN mkdir -p .next/cache && chown -R 1000:1000 .next

# `bun server.js` exécute le serveur avec le runtime Bun, indispensable :
# l'application importe bun:sqlite (journaux, albums, thèmes, better-auth).
# Le schéma better-auth est créé au démarrage par instrumentation.ts.
CMD ["bun", "server.js"]
