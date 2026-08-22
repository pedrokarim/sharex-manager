# Version de Bun ÉPINGLÉE, volontairement.
#
# Le tag flottant `oven/bun:1` est un piège ici : Next 16.3 échoue au build sous
# un Bun antérieur à 1.3.14 avec « Expected CommonJS module to have a function
# wrapper » sur app-page-turbo.runtime.prod.js. Une machine dont le cache
# contient une image plus ancienne produirait donc un build cassé, sans que rien
# n'indique la cause. Toute montée de version se fait ici, sciemment.
ARG BUN_VERSION=1.3.14

# Version de Codex ÉPINGLÉE, pour la même raison que Bun : une image
# reconstruite dans six mois doit livrer le binaire qu'on a validé, pas le
# dernier en date. Toute montée de version se fait ici, sciemment.
ARG CODEX_VERSION=0.149.0

FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# Codex CLI, pour le module ai-image-gen
#
# Le module sait générer des images en pilotant un agent en ligne de commande
# déjà authentifié, ce qui consomme un abonnement au lieu d'une clé facturée à
# l'image. Encore faut-il que le binaire existe dans le conteneur.
#
# On prend l'archive « package » et non le binaire nu : elle embarque `rg` et
# surtout `bwrap`, le bac à sable que Codex utilise sous Linux. Sans lui,
# l'exécution en `--sandbox read-only` échoue.
#
# Ce que l'archive ne contient pas, en revanche, c'est la compétence de
# génération d'images : Codex la sème dans $CODEX_HOME au premier lancement.
# Un volume vide suffit donc, rien à préinstaller.
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS codex
ARG CODEX_VERSION
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "${TARGETARCH:-amd64}" in \
      amd64) target="x86_64-unknown-linux-musl" ;; \
      arm64) target="aarch64-unknown-linux-musl" ;; \
      *) echo "ERREUR: architecture non gérée pour Codex: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    mkdir -p /opt/codex; \
    curl -fsSL "https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-package-${target}.tar.gz" \
      | tar -xz -C /opt/codex; \
    chmod +x /opt/codex/bin/* /opt/codex/codex-path/* /opt/codex/codex-resources/bwrap
# Échec au build plutôt qu'une image qui démarre sans moteur : une archive
# tronquée ou une architecture inattendue se voit ici, pas en production.
RUN /opt/codex/bin/codex --version

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

# Bun 1.3.14 segfaute par intermittence en fermant ses workers, APRÈS que
# `next build` a terminé son travail : le tableau des routes est déjà affiché,
# `.next/standalone` et `.next/static` sont complets, mais le processus sort en
# 132 et Docker déclare l'étape en échec. Bun le reconnaît dans sa propre
# trace : « oh no: Bun has crashed. This indicates a bug in Bun, not your code ».
#
# On n'ignore pas l'échec pour autant : on ne le tolère que si les deux
# répertoires attendus sont là. Une vraie erreur de compilation ne les produit
# pas, et fait donc toujours échouer le build.
RUN set +e; bun run build; status=$?; set -e; \
    if [ ! -d .next/standalone ] || [ ! -d .next/static ]; then \
      echo "ERREUR: le build n'a produit ni .next/standalone ni .next/static (sortie ${status})."; \
      exit 1; \
    fi; \
    if [ "$status" -ne 0 ]; then \
      echo "AVERTISSEMENT: bun est sorti en ${status} après un build complet (crash connu à la fermeture). Artefacts vérifiés, on continue."; \
    fi

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
    /app/config \
    /app/codex-home && \
    chmod 755 /app/uploads \
    /app/uploads/thumbnails \
    /app/data \
    /app/config \
    /app/codex-home && \
    chown -R 1000:1000 /app/uploads /app/data /app/config /app/codex-home

# Codex, plus son `rg` et son `bwrap`. Le PATH plutôt qu'un lien symbolique :
# le binaire déduit l'emplacement de ses ressources du sien, un lien depuis
# /usr/local/bin lui ferait chercher `codex-resources` au mauvais endroit.
COPY --from=codex /opt/codex /opt/codex
ENV PATH="/opt/codex/bin:${PATH}"

# Emplacement explicite, indépendant de l'utilisateur qui fait tourner le
# conteneur : le compose impose un UID arbitraire, et $HOME peut alors pointer
# ailleurs, voire nulle part. C'est ici que vivent les jetons de session Codex,
# d'où le volume.
ENV CODEX_HOME=/app/codex-home

# La sortie standalone embarque server.js, proxy.ts et le sous-ensemble de
# node_modules réellement utilisé.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

VOLUME ["/app/uploads", "/app/config", "/app/data", "/app/codex-home"]

RUN mkdir -p .next/cache && chown -R 1000:1000 .next

# `bun server.js` exécute le serveur avec le runtime Bun, indispensable :
# l'application importe bun:sqlite (journaux, albums, thèmes, better-auth).
# Le schéma better-auth est créé au démarrage par instrumentation.ts.
CMD ["bun", "server.js"]
