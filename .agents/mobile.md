# Guide agent – application mobile

L'application Expo/React Native se trouve dans `sharex-mobile/`. Elle contient
du code natif local ; Expo Go ne suffit donc pas pour valider toutes ses
fonctionnalités.

## Avant de modifier

1. Lire [`docs/versioning.md`](../docs/versioning.md) pour toute modification de
   version, build de distribution ou release.
2. Vérifier si le changement touche `modules/`, un plugin Expo, les permissions,
   le partage système, le splash ou les icônes. Ces changements nécessitent une
   reconstruction native.

## Sources et version

- Identifiant du composant : `mobile`.
- Version publique : `expo.version` dans `app.json`.
- La version de `sharex-mobile/package.json` et les métadonnées du lockfile
  doivent rester identiques à `expo.version`.
- Build Android (`versionCode`) et iOS (`buildNumber`) : compteurs monotones
  gérés par EAS, distincts de SemVer.
- Changelog : `sharex-mobile/CHANGELOG.md`.
- Tags : `mobile-vMAJEUR.MINEUR.CORRECTIF`.

## Vérifications usuelles

```sh
cd sharex-mobile
npm ci
npx tsc --noEmit
npx expo-doctor
```

Pour une validation Android installable :

```sh
npx eas-cli build --platform android --profile production-apk --local \
  --output dist/sharex-manager.apk
```

Un build signé ou réussi ne doit pas être publié, tagué ou soumis à un store
sans demande explicite. Ne jamais ajouter les identifiants EAS/Apple/Android au
dépôt.
