# Authentification de ShareX Manager

ShareX Manager propose deux modes exclusifs. Une installation existante qui ne
définit rien conserve l'authentification intégrée.

| Mode | Valeur | Usage |
| --- | --- | --- |
| Intégré | `SHAREX_AUTH_PROVIDER=builtin` | Self-hosting classique, comptes et mots de passe locaux |
| Ascencia ID | `SHAREX_AUTH_PROVIDER=ascencia` | SSO OIDC et politique d'accès centralisée |

## Assistant d'installation

Après `bun install`, lancer :

```sh
bun run setup
```

L'assistant demande l'URL publique, le port d'écoute et le mode
d'authentification, génère `AUTH_SECRET`, puis crée ou complète `.env`.
Lorsqu'un `.env` doit être modifié, une sauvegarde locale `.env.bak-<date>` est
créée. Les autres variables et les fichiers de données existants sont
préservés.

Sur une installation neuve en mode intégré, il demande aussi le premier
administrateur. Seul le hash bcrypt du mot de passe est écrit dans
`data/users.json`, puis importé dans la base d'authentification au premier
démarrage.

Le mode automatisé convient aux images et outils de déploiement :

```sh
bun run cli -- --no-interactive setup \
  --auth builtin \
  --app-url https://sharex.example.com \
  --port 3000 \
  --admin-username admin \
  --admin-password 'un-mot-de-passe-long-et-unique'
```

Pour éviter de placer le mot de passe dans l'historique du shell, une
automatisation peut utiliser `SHAREX_SETUP_ADMIN_USERNAME` et
`SHAREX_SETUP_ADMIN_PASSWORD`. Ces variables servent uniquement au bootstrap
et ne sont jamais recopiées dans `.env`.

Pour Ascencia ID :

```sh
bun run cli -- --no-interactive setup \
  --auth ascencia \
  --app-url https://sharex.example.com \
  --port 3000 \
  --ascencia-issuer https://id.ascencia.re \
  --ascencia-client-id asc_cid_example \
  --ascencia-client-secret 'secret fourni par Ascencia ID' \
  --ascencia-admin-roles superadmin
```

Ne jamais placer le client secret dans Git, un argument de construction Docker
ou une variable `NEXT_PUBLIC_*`. Il est lu uniquement à l'exécution depuis
`.env` ou le gestionnaire de secrets de l'hébergeur.

## Créer l'application dans Ascencia ID

Dans la console Ascencia ID, créer une application de type `web` avec :

- URI de retour :
  `https://sharex.example.com/api/auth/oauth2/callback/ascencia` ;
- flux `authorization_code` avec PKCE S256 ;
- scopes `openid`, `profile`, `email`, `offline_access` et
  `ascencia.roles` ;
- politique `role_gated` ;
- au moins un rôle requis, par exemple le rôle plateforme `superadmin` et un
  rôle applicatif dédié aux personnes autorisées.

La politique est appliquée par Ascencia ID avant l'émission du code et de ses
jetons. Une personne non autorisée ne peut donc pas créer une session ShareX
Manager en appelant directement son API d'authentification.

`ASCENCIA_ADMIN_ROLES` contrôle une décision différente : les rôles de cette
liste deviennent `admin` dans ShareX Manager. Les autres personnes admises par
la politique Ascencia ID restent de simples utilisateurs. La valeur par défaut
est `superadmin`; plusieurs clés sont séparées par des virgules.

## Retour au mode intégré

Remettre `SHAREX_AUTH_PROVIDER=builtin` et redémarrer l'application. La base
locale Better Auth est conservée dans les deux modes, donc le changement ne
supprime ni compte ni donnée. Les endpoints mot de passe sont désactivés tant
que le mode Ascencia ID est actif.
