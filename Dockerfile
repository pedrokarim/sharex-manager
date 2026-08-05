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

# Les NEXT_PUBLIC_* sont inlinées dans le bundle client AU MOMENT DU BUILD.
# Les définir dans le compose ne sert qu'au code serveur : le navigateur, lui,
# reçoit la valeur figée ici. Comme `.env` est exclu de l'image (il contient
# AUTH_SECRET), ces valeurs doivent arriver par --build-arg, sinon le client
# retombe sur les valeurs par défaut du code — c'est ce qui avait produit des
# liens « http://localhost:3000/api/files/... » copiés depuis la galerie.
#
# Ces trois valeurs sont publiques par nature : elles partent dans le bundle
# livré au navigateur. Aucun secret ne doit passer par un ARG, qui reste
# lisible dans l'historique de l'image.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_IMAGE_DOMAIN
ARG NEXT_PUBLIC_APP_DOMAIN
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_IMAGE_DOMAIN=${NEXT_PUBLIC_IMAGE_DOMAIN}
ENV NEXT_PUBLIC_APP_DOMAIN=${NEXT_PUBLIC_APP_DOMAIN}

# Échec immédiat plutôt qu'une image qui démarre en distribuant de mauvaises
# URL. L'oubli précédent n'était visible qu'en cliquant « copier le lien » en
# production.
RUN test -n "$NEXT_PUBLIC_API_URL" -a -n "$NEXT_PUBLIC_IMAGE_DOMAIN" -a -n "$NEXT_PUBLIC_APP_DOMAIN" \
    || { echo "ERREUR: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_IMAGE_DOMAIN et NEXT_PUBLIC_APP_DOMAIN doivent être fournis via --build-arg (le compose les lit depuis .env)."; exit 1; }

ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Garde-fou : si une URL de repli s'est glissée dans le bundle client, c'est que
# l'inlining n'a pas pris. Mieux vaut casser le build que livrer ça.
RUN ! grep -rqF "localhost:3000/api/files" .next/static \
    || { echo "ERREUR: des URL localhost sont figées dans le bundle client — NEXT_PUBLIC_IMAGE_DOMAIN n'a pas été pris en compte."; exit 1; }

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
