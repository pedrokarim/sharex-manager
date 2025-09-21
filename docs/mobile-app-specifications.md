# Spécifications de l'Application Mobile ShareX Manager

## Vue d'ensemble du projet

L'objectif de ce projet est de créer une application mobile qui permettra aux utilisateurs de capturer, sélectionner et envoyer des images directement vers le système ShareX Manager existant. Cette application mobile agira comme un client mobile pour le système web, permettant une expérience similaire à celle de ShareX sur desktop.

## Analyse du système existant

### Architecture actuelle du ShareX Manager
- **Backend** : Next.js 14 avec API routes
- **Authentification** : NextAuth.js v5 avec clés API
- **Upload** : Endpoint `/api/upload` avec validation des clés API
- **Stockage** : Système de fichiers local avec génération de thumbnails
- **Modules** : Système modulaire pour le traitement d'images (crop, resize, watermark, etc.)
- **Galerie** : Interface web pour visualiser et gérer les fichiers uploadés

### Système d'authentification
- Utilisation de clés API générées via l'interface d'administration
- Validation des permissions par type de fichier (images, documents, archives)
- Logs détaillés des activités d'upload
- Gestion des tokens de suppression

## Fonctionnalités proposées pour l'application mobile

### 1. Capture et envoi d'images

#### 1.1 Détection automatique des captures d'écran
**Android :**
- ✅ **Android 14+** : API officielle `registerScreenCaptureCallback()`
  - Détection en temps réel des captures d'écran
  - Nécessite la permission `DETECT_SCREEN_CAPTURE`
  - Limitation : L'API ne fournit pas directement l'image capturée
- ⚠️ **Android < 14** : Surveillance du dossier de captures d'écran
  - Utilisation d'un `ContentObserver` pour détecter les nouveaux fichiers
  - Nécessite l'autorisation d'accès au stockage
  - Peut être affecté par les restrictions de confidentialité

**iOS :**
- ✅ **iOS 7+** : Notification `UIApplicationUserDidTakeScreenshotNotification`
  - Détection des captures d'écran via les notifications système
  - Limitation : Pas d'accès direct à l'image capturée
  - Nécessite une surveillance du dossier Photos

#### 1.2 Partage manuel via le système
**Android :**
- Implémentation d'un Intent Filter pour recevoir les images partagées
- Action : `ACTION_SEND` avec type MIME `image/*`
- L'application apparaît dans le menu de partage natif

**iOS :**
- Implémentation d'une Share Extension
- Intégration dans le menu de partage natif
- Support des types de contenu image

#### 1.3 Sélection d'images depuis l'application
- Interface de sélection de photos depuis la galerie
- Prise de photos avec l'appareil photo
- Support des formats : JPG, PNG, GIF, WebP

### 2. Configuration et authentification

#### 2.1 Configuration de l'application
- **URL du serveur** : Configuration de l'URL du ShareX Manager
- **Clé API** : Stockage sécurisé de la clé API utilisateur
- **Paramètres d'upload** : Configuration des options d'upload

#### 2.2 Gestion des clés API
- Stockage sécurisé des clés API (Keychain/Keystore)
- Validation des permissions de la clé
- Gestion des clés expirées

### 3. Interface utilisateur

#### 3.1 Écrans principaux
1. **Écran d'accueil**
   - Statut de connexion au serveur
   - Bouton de capture rapide
   - Accès à la galerie

2. **Écran de configuration**
   - Paramètres du serveur
   - Gestion des clés API
   - Options d'upload

3. **Écran de galerie**
   - Visualisation des images récemment uploadées
   - Historique des uploads
   - Gestion des fichiers

4. **Écran de capture**
   - Interface de capture d'écran
   - Prévisualisation avant envoi
   - Options de traitement (crop, resize, etc.)

#### 3.2 Notifications
- Notifications de succès/échec d'upload
- Notifications de capture d'écran détectée
- Notifications de statut de connexion

## Spécifications techniques

### 1. Plateformes cibles
- **Android** : API 21+ (Android 5.0+)
- **iOS** : iOS 12.0+

### 2. Technologies recommandées

#### Option 1 : React Native
**Avantages :**
- Partage de code entre Android et iOS
- Écosystème riche de bibliothèques
- Support natif des fonctionnalités de partage

**Bibliothèques utiles :**
- `react-native-share` : Gestion du partage
- `react-native-image-picker` : Sélection d'images
- `react-native-keychain` : Stockage sécurisé
- `react-native-screenshot-detector` : Détection de captures d'écran

#### Option 2 : Flutter
**Avantages :**
- Performance native
- Interface utilisateur cohérente
- Support excellent des fonctionnalités système

**Packages utiles :**
- `share_plus` : Gestion du partage
- `image_picker` : Sélection d'images
- `flutter_secure_storage` : Stockage sécurisé
- `screenshot_callback` : Détection de captures d'écran

#### Option 3 : Capacitor (Hybride)
**Avantages :**
- Réutilisation du code web existant
- Déploiement rapide
- Maintenance simplifiée

**Plugins utiles :**
- `@capacitor/share` : Gestion du partage
- `@capacitor/camera` : Accès à l'appareil photo
- `@capacitor/secure-storage` : Stockage sécurisé

### 3. Architecture de l'application

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Interface     │    │   Logique       │    │   Stockage      │
│   Utilisateur   │◄──►│   Métier        │◄──►│   Local         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Composants    │    │   Services      │    │   Base de       │
│   UI/UX         │    │   API           │    │   Données       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                    ┌─────────────────┐
                    │   ShareX        │
                    │   Manager       │
                    │   (Serveur)     │
                    └─────────────────┘
```

### 4. Flux de données

#### 4.1 Upload d'image
1. **Sélection/Capture** → Image en mémoire
2. **Validation** → Vérification du format et de la taille
3. **Traitement** → Application des modules (optionnel)
4. **Upload** → Envoi vers le serveur avec clé API
5. **Confirmation** → Réception de l'URL et métadonnées

#### 4.2 Détection de capture d'écran
1. **Détection** → Notification système
2. **Récupération** → Accès au fichier de capture
3. **Prévisualisation** → Affichage de l'image
4. **Upload** → Envoi automatique ou manuel

## Considérations de sécurité

### 1. Stockage des données sensibles
- **Clés API** : Stockage dans le Keychain (iOS) ou Keystore (Android)
- **URLs de serveur** : Chiffrement local
- **Tokens** : Gestion sécurisée des sessions

### 2. Communication réseau
- **HTTPS obligatoire** : Toutes les communications chiffrées
- **Validation des certificats** : Vérification des certificats SSL
- **Timeout** : Gestion des timeouts de connexion

### 3. Permissions
- **Accès au stockage** : Pour lire les captures d'écran
- **Appareil photo** : Pour prendre des photos
- **Réseau** : Pour communiquer avec le serveur
- **Notifications** : Pour informer l'utilisateur

## Plan de développement

### Phase 1 : Prototype de base (2-3 semaines)
- [ ] Configuration de l'environnement de développement
- [ ] Interface de base avec écrans principaux
- [ ] Intégration de l'API d'upload du ShareX Manager
- [ ] Gestion des clés API et authentification
- [ ] Upload manuel d'images depuis la galerie

### Phase 2 : Fonctionnalités avancées (3-4 semaines)
- [ ] Implémentation du partage via le système
- [ ] Détection des captures d'écran (Android 14+)
- [ ] Interface de capture d'écran intégrée
- [ ] Notifications et feedback utilisateur
- [ ] Gestion des erreurs et reconnexion

### Phase 3 : Optimisation et tests (2-3 semaines)
- [ ] Tests sur différents appareils et versions
- [ ] Optimisation des performances
- [ ] Gestion des cas d'erreur
- [ ] Tests de sécurité
- [ ] Documentation utilisateur

### Phase 4 : Déploiement (1-2 semaines)
- [ ] Préparation des builds de production
- [ ] Soumission aux stores (Google Play, App Store)
- [ ] Documentation technique
- [ ] Formation des utilisateurs

## Risques et limitations

### 1. Limitations techniques
- **iOS** : Pas d'API publique pour accéder directement aux captures d'écran
- **Android < 14** : Détection de captures d'écran limitée
- **Permissions** : Restrictions croissantes sur l'accès aux fichiers

### 2. Risques de sécurité
- **Stockage des clés** : Risque de compromission des clés API
- **Communication** : Interception des données en transit
- **Permissions** : Accès excessif aux données utilisateur

### 3. Risques d'expérience utilisateur
- **Batterie** : Surveillance continue peut drainer la batterie
- **Performance** : Traitement d'images peut ralentir l'appareil
- **Confidentialité** : Préoccupations des utilisateurs sur l'accès aux photos

## Recommandations

### 1. Approche recommandée
1. **Commencer par le partage manuel** : Plus simple et conforme aux guidelines
2. **Ajouter la détection automatique** : En fonction des retours utilisateurs
3. **Interface native** : Respecter les conventions de chaque plateforme

### 2. Priorités de développement
1. **Fonctionnalité de base** : Upload manuel d'images
2. **Intégration système** : Partage via le menu natif
3. **Détection automatique** : Pour les utilisateurs avancés
4. **Fonctionnalités avancées** : Traitement d'images, albums, etc.

### 3. Métriques de succès
- **Taux d'adoption** : Nombre d'utilisateurs actifs
- **Fréquence d'utilisation** : Nombre d'uploads par utilisateur
- **Satisfaction** : Retours utilisateurs et notes sur les stores
- **Performance** : Temps de réponse et taux d'erreur

## Conclusion

Ce projet d'application mobile ShareX Manager offre une opportunité intéressante d'étendre l'écosystème existant vers les appareils mobiles. L'approche recommandée est de commencer par une version simple avec partage manuel, puis d'ajouter progressivement les fonctionnalités avancées comme la détection automatique des captures d'écran.

La clé du succès résidera dans la simplicité d'utilisation, la fiabilité de la connexion au serveur, et le respect des bonnes pratiques de sécurité et de confidentialité sur mobile.
