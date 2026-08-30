# Sécurité du déploiement serveur

## Frontière réseau

- Le port applicatif est publié uniquement sur `127.0.0.1`.
- Nginx est le seul point d'entrée et refuse les origines directes hors
  Cloudflare, à l'exception du challenge ACME.
- Nginx écrase `X-Real-IP` et `X-Forwarded-For` avec l'adresse restaurée par le
  module real-IP. L'application utilise uniquement `X-Real-IP` pour les quotas
  et les journaux de sécurité.

## Secrets et données runtime

- `.env`, `data/`, `config/uploads.json`, `module-data/`, `codex-home/` et les
  sauvegardes ne doivent jamais entrer dans Git ou dans le contexte Docker.
- Sur l'hôte, les répertoires contenant des données ou sessions sont limités au
  propriétaire (`0700`) et leurs fichiers à `0600`.
- Le montage `codex-home` contient une session d'outil : il doit être traité
  comme un secret et ne doit apparaître ni dans une sauvegarde publique, ni
  dans une image Docker, ni dans les logs.

## Validation après déploiement

1. Vérifier que le conteneur publie uniquement `127.0.0.1:<port>`.
2. Vérifier que l'accès via `sxm.ascencia.re` et `img.ascencia.re` fonctionne.
3. Vérifier qu'un accès direct à l'IP d'origine avec un faux `Host` est fermé.
4. Vérifier les en-têtes HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`
   et `Permissions-Policy`.
5. Vérifier que Better Auth ne journalise plus l'absence d'adresse cliente.

## Construction et reprise

Ne pas construire l'image sur le petit VPS de production : un build Next.js a
saturé ses ressources le 30 août 2026. Construire et tester ailleurs, charger
l'image terminée avec `docker save | zstd | ssh ... docker load`, puis utiliser
`docker compose up -d --no-build sharex-manager`.

Conserver un tag de rollback avant de remplacer l'image active. Un nettoyage
peut retirer le cache BuildKit interrompu, mais ne doit supprimer ni les
volumes runtime, ni le bind mount `codex-home`.
