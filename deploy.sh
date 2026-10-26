#!/usr/bin/env bash
#
# Déploiement de ShareX Manager sur le serveur, depuis la racine du dépôt.
#
#   ./deploy.sh            # tire l'image `main` construite par la CI (GHCR)
#   ./deploy.sh <sha>      # une version précise de la CI (retour arrière)
#   ./deploy.sh --local    # secours : construit l'image sur le serveur
#
# Le mode normal ne construit rien ici : BuildKit tourne dans le démon Docker
# et lui laisse plusieurs Go de mémoire après chaque build. Le mode `--local`
# reste là si GitHub Actions ne peut plus construire (quota, panne) ; il fait
# exactement ce que faisait `docker compose up -d --build`.
#
# Le script met d'abord le dépôt à jour (`git pull --ff-only`, qui refuse
# d'écraser une modification locale), s'arrête à la première erreur et attend
# que l'application réponde avant de rendre la main.

set -euo pipefail
cd "$(dirname "$0")"

SERVICE=sharex-manager
COMPOSE=(docker compose)

echo "→ mise à jour du dépôt"
git pull --ff-only

if [ "${1:-}" = "--local" ]; then
  # Étiquette à part : une image construite ici ne se confond pas avec celle
  # de la CI, et le prochain `./deploy.sh` revient de lui-même à la CI.
  export SXM_TAG=local
  echo "→ construction sur le serveur (secours)"
  "${COMPOSE[@]}" build "$SERVICE"
else
  export SXM_TAG="${1:-main}"
  echo "→ image ghcr.io/pedrokarim/sharex-manager:${SXM_TAG}"
  if ! "${COMPOSE[@]}" pull "$SERVICE"; then
    echo "✗ image introuvable sur GHCR. En secours : ./deploy.sh --local"
    exit 1
  fi
fi

"${COMPOSE[@]}" up -d --remove-orphans "$SERVICE"

port="$(grep -E '^PORT=' .env 2>/dev/null | tail -n 1 | cut -d= -f2 | tr -d '"'"'"' \r')"
port="${port:-3000}"

echo "→ attente de l'application sur le port ${port}"
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/" || true)"
  if [ "$code" != "000" ] && [ "$code" -lt 500 ]; then
    echo "✓ en ligne (HTTP ${code}, image ${SXM_TAG})"
    exit 0
  fi
  sleep 5
done

echo "✗ l'application ne répond pas après 150 s :"
"${COMPOSE[@]}" logs --tail 60 "$SERVICE"
exit 1
