# Politique de versioning et de release

Ce document est la source de vérité pour les versions, tags, changelogs et
artefacts de ShareX Manager. Il s'applique aux humains, aux agents et aux
automatisations CI/CD.

## 1. Deux produits, deux versions

Le dépôt est un monorepo, mais ses produits sont publiés indépendamment.

| Composant | Version publique | Changelog | Préfixe de tag |
| --- | --- | --- | --- |
| Serveur web/API | `package.json` à la racine | `/CHANGELOG.md` | `server-v` |
| Application mobile | `sharex-mobile/app.json` et `sharex-mobile/package.json` | `/sharex-mobile/CHANGELOG.md` | `mobile-v` |

Une modification exclusivement mobile ne change jamais la version serveur, et
inversement. Une évolution transversale peut produire deux releases distinctes,
avec des numéros différents.

Les modules privés de `modules/` suivent la version serveur. Le module natif
`sharex-mobile/modules/sharex-screenshot-upload/` suit la version mobile. Si un
module devient un paquet public autonome, sa propre politique devra être ajoutée
avant sa première publication.

## 2. Version sémantique

Les versions publiques suivent SemVer sous la forme `MAJEUR.MINEUR.CORRECTIF` :

- `MAJEUR` : changement incompatible pour les utilisateurs ou l'API ;
- `MINEUR` : fonctionnalité rétrocompatible ;
- `CORRECTIF` : correction rétrocompatible, sécurité ou régression ;
- prérelease : `-alpha.N`, `-beta.N` ou `-rc.N`.

Exemples : `1.4.0`, `1.4.1`, `2.0.0-beta.1`.

Tant que le serveur reste en `0.x`, une évolution incompatible incrémente la
version mineure et doit être signalée explicitement comme incompatible dans le
changelog. Un correctif `0.x.y` reste rétrocompatible.

Une simple recompilation, une modification de documentation ou une refonte
interne sans effet sur le produit ne déclenche pas automatiquement de nouvelle
version. En revanche, un artefact distribué ne doit jamais être remplacé
silencieusement : toute correction d'un APK/IPA déjà publié exige au minimum une
nouvelle version corrective.

## 3. Versions mobiles et numéros de build

La version visible par l'utilisateur doit être identique dans :

- `sharex-mobile/app.json` → `expo.version` ;
- `sharex-mobile/package.json` → `version` ;
- `sharex-mobile/package-lock.json` → version du projet racine du lockfile.

Les compteurs natifs sont différents de SemVer :

- Android : `versionCode` ;
- iOS : `buildNumber`.

Ils sont monotones et gérés à distance par EAS, conformément à
`cli.appVersionSource: "remote"`. Chaque build destiné à une nouvelle release
doit incrémenter son compteur natif. Les profils de développement ou de preview
peuvent être reconstruits sans changement de version publique.

## 4. Tags Git

Les tags identifient sans ambiguïté le composant publié :

- serveur stable : `server-v0.2.0` ;
- mobile stable : `mobile-v1.1.0` ;
- mobile en prérelease : `mobile-v1.2.0-beta.1`.

Règles :

- le tag pointe sur le commit exact contenant la version et le changelog ;
- le tag est annoté et n'est ni déplacé ni réutilisé ;
- le préfixe générique `v1.2.3` n'est pas utilisé dans ce monorepo ;
- une GitHub Release stable correspond à un tag stable ;
- un tag `alpha`, `beta` ou `rc` produit une GitHub prerelease ;
- les artefacts portent la même version que leur tag.

Exemples de noms d'artefacts :

```text
sharex-manager-mobile-1.1.0.apk
sharex-manager-mobile-1.1.0.aab
sharex-manager-mobile-1.1.0.ipa
sharex-manager-server-0.2.0.tar.gz
SHA256SUMS
```

## 5. Changelogs

Chaque changelog conserve une section `Unreleased`. Toute modification visible
par l'utilisateur doit y être ajoutée dans l'une des catégories suivantes :

- `Added` ;
- `Changed` ;
- `Deprecated` ;
- `Removed` ;
- `Fixed` ;
- `Security`.

Au moment d'une release :

1. déplacer les entrées pertinentes de `Unreleased` vers
   `[X.Y.Z] - AAAA-MM-JJ` ;
2. laisser une nouvelle section `Unreleased` vide ;
3. ne pas mélanger les changements serveur et mobile ;
4. rédiger les notes pour les utilisateurs, pas comme une liste de fichiers.

## 6. Convention de commits

Les commits de travail suivent de préférence Conventional Commits avec un scope
explicite :

```text
feat(mobile): ajouter l'envoi automatique des captures
fix(mobile): synchroniser les uploads natifs avec les récents
fix(server): corriger la validation des clés API
docs(versioning): documenter les tags du monorepo
chore(mobile): préparer la release 1.1.0
```

Un changement incompatible utilise `!`, par exemple
`feat(server)!: remplacer le format de réponse de l'API`.

Le message de commit aide à préparer le changelog mais ne décide pas seul de la
version. La portée réelle et l'impact utilisateur restent déterminants.

## 7. Compatibilité serveur/mobile

Lorsqu'une fonctionnalité mobile dépend d'une nouvelle API :

1. publier le serveur compatible en premier ;
2. conserver une compatibilité mobile raisonnable avec l'ancienne API ou
   afficher clairement la version minimale requise ;
3. publier ensuite l'application mobile ;
4. documenter la dépendance dans les deux changelogs si elle affecte les
   utilisateurs.

Une rupture de contrat API suit la règle `MAJEUR`, ou `MINEUR` explicitement
incompatible tant que le serveur est en `0.x`.

## 8. Préparation d'une release

Checklist commune :

1. confirmer explicitement le composant et la version cible ;
2. vérifier que le dépôt ne contient aucun secret ni changement involontaire ;
3. exécuter les tests et builds requis pour le composant ;
4. mettre à jour toutes ses sources de version ;
5. finaliser son changelog ;
6. créer le commit de release ;
7. créer le tag annoté du composant ;
8. laisser la CI construire les artefacts depuis ce tag ;
9. vérifier la signature et publier les sommes SHA-256 ;
10. publier la GitHub Release, puis soumettre aux stores uniquement si demandé.

Pour Android, le profil `production-apk` produit l'APK installable. Le profil
`production` reste destiné à l'AAB/Google Play. Pour iOS, joindre une IPA à une
GitHub Release ne la rend pas installable sur tous les iPhone : la distribution
publique passe normalement par TestFlight ou l'App Store.

### Workflow GitHub Android

Le workflow `.github/workflows/mobile-release.yml` possède deux modes :

- lancement manuel (`workflow_dispatch`) : utilise le profil `preview`, ne crée
  aucune release et conserve l'APK de test pendant 14 jours dans les artefacts
  du run GitHub Actions ;
- pull request interne vers `main` touchant l'application mobile : exécute le
  même build de preview avec des permissions GitHub en lecture seule ;
- push d'un tag `mobile-vX.Y.Z` : vérifie les quatre sources de version, exige
  une section de changelog datée, utilise `production-apk`, vérifie la signature
  et publie l'APK ainsi que `SHA256SUMS` dans une GitHub Release.

Le dépôt doit posséder un secret Actions `EXPO_TOKEN`. Il permet au build local
exécuté sur le runner GitHub de s'authentifier auprès d'Expo et de récupérer les
identifiants de signature Android déjà configurés. Le token ne doit jamais être
placé dans un fichier du dépôt ou affiché dans les journaux.

Après avoir créé un [token d'accès personnel Expo](https://expo.dev/accounts/pedrokarim/settings/access-tokens),
enregistrez-le depuis la racine du dépôt avec la commande suivante. GitHub CLI
demande sa valeur en saisie masquée :

```sh
gh secret set EXPO_TOKEN
```

Le workflow manuel et les pull requests internes permettent de tester
l'automatisation sans publier. Les secrets ne sont pas exposés aux pull requests
issues de forks. Le mode tag est volontairement bloqué si la version ou le
changelog est incohérent.

## 9. Responsabilités des agents et automatisations

Un agent peut proposer la prochaine version et préparer les fichiers, mais ne
doit jamais, sans demande explicite :

- augmenter une version ;
- créer, déplacer ou supprimer un tag ;
- publier ou modifier une GitHub Release ;
- envoyer un build à Google Play, TestFlight ou l'App Store ;
- modifier ou exposer des secrets de signature.

Les workflows déclenchés par tag doivent vérifier que le tag, la version du
composant et le changelog correspondent avant de construire. Une incohérence
doit faire échouer la release plutôt que produire un artefact mal versionné.

## 10. Amorçage du dépôt

Le dépôt ne possède pas encore de tags historiques. Les versions présentes dans
les manifestes ne constituent pas à elles seules des releases GitHub.

- La première release serveur sera créée explicitement à partir de la version
  choisie le jour de sa publication.
- La première release mobile pourra utiliser `mobile-v1.0.0` seulement si le
  commit publié contient bien la version `1.0.0`, son changelog final et les
  artefacts validés.
- Aucun tag rétroactif ne doit être inventé sans preuve du contenu réellement
  distribué.

Références : [Semantic Versioning](https://semver.org/) et
[Keep a Changelog](https://keepachangelog.com/).
