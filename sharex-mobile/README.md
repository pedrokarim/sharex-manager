# ShareX Manager Mobile

Application mobile pour ShareX Manager permettant d'uploader des images depuis votre appareil mobile vers votre serveur ShareX Manager.

## 🚀 Fonctionnalités

- **Upload d'images** : Sélection depuis la galerie ou prise de photo
- **Configuration serveur** : Gestion de l'URL du serveur et des clés API
- **Stockage sécurisé** : Sauvegarde sécurisée des paramètres
- **Interface intuitive** : Design moderne et responsive
- **Galerie** : Visualisation des images uploadées
- **Notifications** : Feedback utilisateur pour les uploads

## 📱 Plateformes supportées

- **Android** : API 21+ (Android 5.0+)
- **iOS** : iOS 12.0+

## 🛠️ Technologies utilisées

- **React Native** avec Expo
- **TypeScript** pour la sécurité des types
- **React Navigation** pour la navigation
- **Expo Secure Store** pour le stockage sécurisé
- **Expo Image Picker** pour la sélection d'images
- **Expo Camera** pour la prise de photos

## 📦 Installation

1. **Prérequis** :
   - Node.js 18+
   - Bun (recommandé) ou npm
   - Expo CLI
   - Android Studio (pour Android)
   - Xcode (pour iOS)

2. **Installation des dépendances** :
   ```bash
   bun install
   ```

3. **Lancement en développement** :
   ```bash
   bun start
   ```

4. **Lancement sur Android** :
   ```bash
   bun android
   ```

5. **Lancement sur iOS** :
   ```bash
   bun ios
   ```

## ⚙️ Configuration

### Configuration du serveur

1. Ouvrez l'application
2. Allez dans **Paramètres**
3. Entrez l'URL de votre serveur ShareX Manager
4. Entrez votre clé API
5. Testez la connexion
6. Sauvegardez les paramètres

### Permissions requises

L'application demande les permissions suivantes :

- **Appareil photo** : Pour prendre des photos
- **Galerie** : Pour sélectionner des images
- **Stockage** : Pour sauvegarder les paramètres

## 🏗️ Architecture

```
src/
├── components/          # Composants réutilisables
├── screens/            # Écrans de l'application
│   ├── HomeScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── UploadScreen.tsx
│   └── GalleryScreen.tsx
├── services/           # Services métier
│   ├── api.ts         # Communication avec l'API
│   ├── storage.ts     # Stockage sécurisé
│   └── imageService.ts # Gestion des images
├── types/             # Types TypeScript
├── utils/             # Utilitaires
└── hooks/             # Hooks React personnalisés
```

## 🔧 Services

### API Service
- Communication avec le serveur ShareX Manager
- Upload d'images avec clé API
- Test de connexion
- Validation des clés API

### Storage Service
- Stockage sécurisé des paramètres
- Gestion des clés API
- Configuration du serveur

### Image Service
- Sélection d'images depuis la galerie
- Prise de photos
- Gestion des permissions
- Traitement des images

## 📋 Utilisation

### Upload d'une image

1. **Sélection depuis la galerie** :
   - Appuyez sur "Sélectionner une image"
   - Choisissez une image dans votre galerie
   - L'image s'ouvre dans l'écran d'upload

2. **Prise de photo** :
   - Appuyez sur "Prendre une photo"
   - Prenez une photo avec l'appareil
   - La photo s'ouvre dans l'écran d'upload

3. **Upload** :
   - Vérifiez les informations de l'image
   - Appuyez sur "Uploader l'image"
   - Attendez la confirmation d'upload

### Configuration

1. **Paramètres du serveur** :
   - URL du serveur (ex: https://votre-serveur.com)
   - Clé API générée depuis l'interface web

2. **Options de l'application** :
   - Upload automatique
   - Notifications
   - Thème (clair/sombre/auto)

## 🔒 Sécurité

- **Stockage sécurisé** : Utilisation d'Expo Secure Store
- **Communication HTTPS** : Toutes les communications sont chiffrées
- **Validation des clés API** : Vérification avant chaque upload
- **Permissions minimales** : Seules les permissions nécessaires sont demandées

## 🐛 Dépannage

### Problèmes courants

1. **Erreur de connexion** :
   - Vérifiez l'URL du serveur
   - Vérifiez votre clé API
   - Vérifiez votre connexion internet

2. **Permissions refusées** :
   - Allez dans les paramètres de l'appareil
   - Autorisez l'accès à la galerie et à l'appareil photo

3. **Upload échoué** :
   - Vérifiez la taille de l'image
   - Vérifiez le format de l'image
   - Vérifiez la connexion au serveur

## 🚀 Déploiement

La version visible doit rester synchronisée entre `app.json`, `package.json` et
`package-lock.json`. Les règles complètes, les tags `mobile-vX.Y.Z` et la
checklist sont décrits dans la
[politique de versioning](../docs/versioning.md) et le
[changelog mobile](CHANGELOG.md).

### Builds Android

APK de preview :

```bash
npx eas-cli build --platform android --profile preview
```

APK de production installable :

```bash
npx eas-cli build --platform android --profile production-apk
```

Build identique exécuté localement, sans file d'attente EAS :

```bash
npx eas-cli build --platform android --profile production-apk --local \
  --output dist/sharex-manager.apk
```

Le profil `production` produit l'artefact destiné au store, généralement un
AAB :

```bash
npx eas-cli build --platform android --profile production
```

### Test et release avec GitHub Actions

Après avoir ajouté le secret Actions `EXPO_TOKEN` au dépôt :

```bash
gh secret set EXPO_TOKEN
```

1. ouvrez **Actions → Mobile APK → Run workflow** ;
2. le workflow construit un APK de test sans créer de tag ni de release ;
3. téléchargez directement l'APK dans la section **Artifacts** du run.

Une pull request interne vers `main` qui modifie l'application lance également
ce build de test. Les pull requests issues de forks n'accèdent pas au secret
Expo et ne lancent pas ce job signé.

Une vraie release est déclenchée uniquement par un tag conforme, par exemple
`mobile-v1.1.0`. La version et la section datée correspondante du
[`CHANGELOG.md`](CHANGELOG.md) doivent être préparées avant de pousser le tag.

### Build iOS

```bash
npx eas-cli build --platform ios --profile production
```

### Publication sur les stores

1. **Google Play Store** :
   - Créez un compte développeur
   - Uploadez l'AAB de production
   - Remplissez les informations de l'application

2. **App Store** :
   - Créez un compte développeur Apple
   - Uploadez l'IPA
   - Soumettez pour révision

## 📄 Licence

Ce projet est sous licence GNU General Public License v3.0. Voir le fichier `LICENSE` pour plus de détails.

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commiter vos changements
4. Pousser vers la branche
5. Ouvrir une Pull Request

## 📞 Support

Pour toute question ou problème :

- Ouvrez une issue sur GitHub
- Consultez la documentation du projet principal
- Contactez l'équipe de développement
