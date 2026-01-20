## Déploiement auto via cron (Bun + Git + Docker)

Ce projet peut être déployé en mode “pull-based” depuis le VPS: un cron exécute une commande CLI Bun qui vérifie si `origin/main` a bougé. S’il y a une mise à jour, le serveur fait un `git reset --hard` puis reconstruit/redémarre via Docker Compose.

La commande CLI fournie est `cli/commands/deploy-cron.ts` (via `bun run deploy:cron`).

### Prérequis sur le VPS

- **Git** (repo cloné sur le serveur)
- **Bun** (pour exécuter le script)
- **Docker** + **Docker Compose**
  - soit `docker compose` (plugin)
  - soit `docker-compose` (legacy)

### Préparation du projet

- Cloner le repo sur le VPS
- Créer `.env` (ex: en copiant `.env.example`), car `docker-compose.yml` charge `env_file: .env`
- S’assurer que les dossiers montés existent et sont persistants:
  - `./config`
  - `./uploads`
  - `./data`

### Test manuel (recommandé avant cron)

Depuis la racine du repo sur le VPS:

```bash
bun run deploy:cron
```

### Configuration cron (toutes les 2 heures)

Exemple (Linux):

```bash
crontab -e
```

Puis ajouter une ligne (à adapter):

```bash
0 */2 * * * cd /chemin/vers/sharex-manager && bun run deploy:cron >> /var/log/sharex-manager-deploy.log 2>&1
```

Notes:

- **Le `cd` est important**: le script doit être exécuté depuis la racine du projet (là où se trouve `package.json`).
- Les logs sont redirigés vers `/var/log/sharex-manager-deploy.log` (à ajuster selon tes permissions).

### Variables de configuration (optionnelles)

Le script supporte ces variables d’environnement:

- **`DEPLOY_BRANCH`**: branche à suivre (défaut: `main`)
- **`DEPLOY_REMOTE`**: remote git (défaut: `origin`)
- **`DEPLOY_LOCK_FILE`**: chemin du lockfile (défaut: `.deploy.lock`)
- **`DEPLOY_LOCK_STALE_MINUTES`**: délai après lequel un lock est considéré “stale” et sera supprimé (défaut: `60`)
- **`DEPLOY_GIT_CLEAN`**: si `true`, exécute `git clean -fd` après le reset (défaut: `true`)
- **`DEPLOY_DOCKER_COMPOSE_COMMAND`**: commande compose (défaut: `docker compose`)
- **`DEPLOY_DOCKER_COMPOSE_FILE`**: fichier compose (défaut: `docker-compose.yml`)

Exemple cron avec `docker-compose` (legacy) et une autre branche:

```bash
0 */2 * * * cd /chemin/vers/sharex-manager && DEPLOY_BRANCH=dev DEPLOY_DOCKER_COMPOSE_COMMAND=docker-compose bun run deploy:cron >> /var/log/sharex-manager-deploy.log 2>&1
```

### Comportement exact en cas de mise à jour

Si `HEAD` est différent de `origin/<branche>`:

- `git fetch --prune origin <branche>`
- `git checkout -f <branche>`
- `git reset --hard origin/<branche>`
- optionnel: `git clean -fd`
- `docker compose up -d --build --remove-orphans`

### Sécurité / bonnes pratiques

- Exécuter le cron avec un utilisateur non-root (si possible).
- Protéger la branche (reviews, CI, etc.), car ce mécanisme déploie automatiquement ce qui arrive sur la branche suivie.
- Garder une sauvegarde des volumes (`uploads/`, `data/`, `config/`).

