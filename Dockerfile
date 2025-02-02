FROM oven/bun:1 as base
WORKDIR /app

# Installation des dépendances
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build de l'application
COPY . .
RUN bun run build

# Configuration des volumes
RUN mkdir -p /app/uploads /app/config
VOLUME ["/app/uploads", "/app/config"]

# Exposition du port
EXPOSE 3000

# Commande de démarrage
CMD ["bun", "run", "start"] 