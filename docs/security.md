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
  propriétaire (`0700`) et leurs fichiers à `0600`. Au démarrage, le serveur
  resserre lui-même `data/` et ses fichiers sensibles (clés API, historique,
  fichiers privés, jetons de suppression, bases `auth.db`, `logs.db`,
  `security.db`) ; `bun run setup` les crée en `0600`.
- Le montage `codex-home` contient une session d'outil : il doit être traité
  comme un secret et ne doit apparaître ni dans une sauvegarde publique, ni
  dans une image Docker, ni dans les logs.

## Réglages de sécurité

Les réglages vivent dans `data/security.json` (droits `0600`), lus par
`src/lib/security/settings.ts` avec des valeurs par défaut sûres. Ils se lisent
et se modifient par `GET`/`PUT /api/admin/security/settings` (administrateurs
seulement, contrôle d'origine). Un champ refusé n'est jamais écrit ; un champ
abîmé à la main reprend sa valeur par défaut.

| Section | Contenu | Défaut | Mode |
| --- | --- | --- | --- |
| `passwords` | longueur minimale, refus des mots de passe courants | 12, oui | builtin |
| `sessions` | durée, renouvellement | 7 jours, 24 h | les deux, au redémarrage |
| `signIn` | échecs avant blocage, durée du blocage | 5, 15 min | builtin |
| `apiKeys` | durée de vie par défaut et maximale, envois par heure | 90 j, 365 j, 120 | les deux |
| `rateLimits` | niveau (souple, normal, strict) | normal | les deux |
| `logs` | conservation, affichages d'images (tous, un sur vingt, aucun) | 90 j, tous | les deux |
| `alerts` | échecs répétés, nouvelle clé API, admin depuis une nouvelle IP, fichier rendu public | toutes | les deux |

Remarques :

- better-auth lit la durée des sessions et la longueur minimale une seule fois,
  au démarrage : une modification de `sessions` s'applique au prochain
  redémarrage. La politique complète des mots de passe est en plus vérifiée à
  chaque création ou changement (administration, CLI, `bun run setup`,
  `scripts/auth-set-password.ts`).
- Changer le mot de passe d'un compte ferme ses sessions.
- Le blocage après des échecs de connexion est gardé dans `data/security.db`
  (un redémarrage ne le lève pas), par identifiant et par adresse IP (le
  triple du seuil pour une IP, rien pour une adresse inconnue).
- Les tentatives refusées sur une image privée sont toujours journalisées,
  quel que soit le réglage des affichages d'images.
- Le journal est purgé au démarrage, puis chaque jour, selon `logs.retentionDays`.

### Volontairement non configurable

Un réglage ouvrirait une faille sans rien apporter : ces points restent dans
le code.

- Inscription fermée : le premier admin vient de `bun run setup`, les suivants
  de l'écran Utilisateurs.
- En-têtes de sécurité, CSP, cookies de session.
- Bac à sable de Codex : seulement par variable d'environnement côté serveur
  (`AI_IMAGE_GEN_ALLOW_UNSANDBOXED`), jamais depuis le navigateur.
- Chiffrement des secrets, contrôle des types de fichiers, protections
  anti-SSRF.

## Sessions et alertes

- `GET /api/admin/security/sessions[?userId=]`, `DELETE …?id=` ou `…?userId=` :
  sessions de tous les comptes, pour les administrateurs.
- `GET /api/account/sessions`, `DELETE …?id=` ou `…?scope=others` : ses propres
  sessions.
- `GET /api/admin/security/alerts[?all=1]`, `POST { id }` ou `{ all: true }` :
  alertes et accusé de lecture.

Aucune de ces routes ne renvoie un jeton de session.

## Clés API et limites de débit

- Le serveur tire chaque clé (`sk_` + 43 caractères aléatoires) et ne garde
  dans `data/api-keys.json` que son empreinte SHA-256 et un préfixe
  d'affichage. La clé complète n'est remise qu'une fois, à la création.
  Une ancienne clé en clair est convertie à la première lecture du fichier ;
  les configurations ShareX déjà distribuées continuent de fonctionner.
- Validation unique (`src/lib/api-key-validator.ts`), par en-tête
  `x-api-key`, pour `/api/upload` et `/api/colors` (le champ `apiKey` du
  formulaire y reste accepté, déprécié). `/api/colors` exige la permission
  « extraction de couleurs ».
- Durée de vie bornée par `apiKeys.defaultExpiryDays` et
  `apiKeys.maxExpiryDays`. Les clés d'un compte supprimé sont révoquées.
- `GET /api/admin/security/api-keys`, `DELETE …?id=` : toutes les clés
  (préfixe, propriétaire, état, envois de la dernière heure), sans empreinte.
- Limites selon `rateLimits.level` : envois par clé et par heure sur
  `/api/upload` (la plus stricte des deux avec `apiKeys.uploadsPerHour`),
  affichages d'images par adresse sur `/img-handler` et les images publiques,
  appels de l'API publique par adresse. Un refus répond `429` avec
  `Retry-After`. Sans adresse attestée (`X-Real-IP`), les requêtes passent
  par un plafond global dix fois plus large, jamais par le compteur d'un
  visiteur.

## Origines et CORS

Les origines admises se lisent dans l'environnement, à un seul endroit
(`src/lib/security/cors-origins.mjs`, partagé par le proxy, `next.config.mjs`
et better-auth) : `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_IMAGE_DOMAIN`,
`AUTH_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, et
`CORS_EXTRA_ORIGINS` (liste séparée par des virgules) pour un autre site qui
appelle l'API publique. Seules les origines de l'application comptent pour le
contrôle d'origine des requêtes qui modifient. `/img-handler` garde
`Access-Control-Allow-Origin: *`, en lecture seule.

`next.config.mjs` fige le domaine de l'application et celui des images au
build (variables `NEXT_PUBLIC_*` passées en `args` dans `docker-compose.yml`) ;
le proxy les relit à l'exécution.

## Chiffrement des secrets

Les jetons des comptes connectés et les clés d'API des modules (AI Image Gen,
Clip Studio, Scan Studio, Reverse Search) sont chiffrés en AES-256-GCM
(`src/lib/connections/crypto.ts`, `src/lib/security/secret-file.ts`). Un
ancien fichier de secrets en clair se lit toujours et il est chiffré à sa
prochaine écriture. Le fichier de cookies YouTube de Clip Studio reste en
clair (yt-dlp le lit), en droits `0600`.

Clé : `CONNECTIONS_ENCRYPTION_KEYS` (liste), sinon
`CONNECTIONS_ENCRYPTION_KEY`, sinon une clé dérivée d'`AUTH_SECRET`.

Rotation :

1. Générer une clé : `openssl rand -base64 32`.
2. Mettre `CONNECTIONS_ENCRYPTION_KEYS="<nouvelle>,<ancienne>"` (l'ancienne
   peut aussi rester dans `CONNECTIONS_ENCRYPTION_KEY`), puis redémarrer.
3. Chaque secret est rechiffré avec la nouvelle clé à sa prochaine écriture
   (réenregistrer une clé dans le module, ou laisser la prolongation des jetons
   faire son œuvre).
4. Retirer l'ancienne clé seulement quand plus aucun fichier ne la cite.

Passer de la clé dérivée à une clé explicite suit la même procédure : tant
qu'`AUTH_SECRET` ne change pas, les secrets écrits avec la clé dérivée restent
lisibles.

## Ascencia ID

En mode `ascencia`, mots de passe, double authentification et verrouillage
relèvent d'Ascencia ID ; l'application journalise le retour du callback OIDC
(réussite ou échec). `ASCENCIA_ADMIN_ROLES` donne le rôle administrateur :
préférer un rôle `admin` propre à l'application, créé dans Ascencia ID, plutôt
qu'un rôle large comme `authorized`, que tout compte autorisé à se connecter
porte.

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
