# Documentation du Système d'Albums - ShareX Manager

## Vue d'ensemble du projet analysé

**ShareX Manager** est une application Next.js 14 avec TypeScript qui fournit une interface web moderne pour gérer les fichiers uploadés via ShareX. Le projet utilise :

- **Framework** : Next.js 14 avec App Router
- **Base de données** : SQLite (via Bun:sqlite)
- **Authentification** : NextAuth v5 (beta)
- **Interface** : Tailwind CSS + Shadcn/ui
- **État global** : Jotai pour les préférences utilisateur
- **Internationalisation** : Système custom avec support FR/EN

### Architecture existante analysée

1. **Structure des routes parallèles** :
   - `app/(app)/` : Routes authentifiées (galerie, uploads, settings, admin)
   - `app/(marketing)/` : Pages publiques (about, contact, legal)

2. **Système de galerie actuel** :
   - Affichage en grille/liste/détails
   - Gestion des fichiers sécurisés et favoris  
   - Préférences utilisateur persistantes
   - Upload via drag & drop ou formulaire

3. **Base de données existante** :
   - SQLite avec table `logs` pour le tracking
   - JSON files pour users, api-keys, history, etc.

## Fonctionnalités du Système d'Albums Proposé

### 1. **Multi-sélection dans la galerie**

#### Mécanismes de sélection
- **Ctrl+Click** : Sélection/désélection individuelle
- **Shift+Click** : Sélection en plage
- **Ctrl+A** : Sélectionner tout
- **Escape** : Désélectionner tout
- **Boutons visuels** : Cases à cocher optionnelles sur les cartes
- **Sélection par rectangle** : Drag pour sélectionner une zone

#### Interface utilisateur
- **Barre d'outils de sélection** : Apparaît quand des éléments sont sélectionnés
- **Compteur** : "X fichier(s) sélectionné(s)" 
- **Actions groupées** : Ajouter à un album, supprimer, déplacer
- **Indicateurs visuels** : Cartes sélectionnées avec bordure colorée

### 2. **Système d'albums (dossiers virtuels)**

#### Gestion des albums
- **Création** : Bouton "Nouveau dossier" sur la page albums
- **Nom personnalisable** : Saisie libre du nom d'album
- **Pas de hiérarchie** : Structure plate uniquement (pas de sous-dossiers)
- **Références virtuelles** : Les fichiers restent physiquement dans `/uploads`

#### Page Albums (`/albums`)
- **Liste des albums** : Affichage en cartes avec aperçu des premières images
- **Compteurs** : Nombre d'images par album
- **Actions** : Renommer, supprimer, partager
- **Recherche** : Filtrer les albums par nom

#### Vue d'un album (`/albums/[albumId]`)
- **Galerie filtrée** : Même interface que la galerie principale
- **Breadcrumb** : Navigation Albums > Nom de l'album
- **Actions spécifiques** : Retirer des images de l'album

### 3. **Menu contextuel (Context Menu)**

#### Intégration Shadcn/ui ContextMenu
- **Clic droit sur une image** :
  - Copier l'URL
  - Télécharger
  - Ajouter aux favoris
  - Basculer sécurité public/privé
  - **Ajouter à un album** (nouveau)
  - Supprimer

- **Clic droit sur sélection multiple** :
  - Ajouter à un album
  - Supprimer la sélection
  - Télécharger en ZIP (futur)

#### Sous-menu "Ajouter à un album"
- **Liste des albums existants** : Sélection directe
- **"Nouvel album..."** : Création rapide avec nom
- **Recherche d'albums** : Si beaucoup d'albums

### 4. **Raccourcis clavier**

#### Raccourcis de base
- **Ctrl+A** : Sélectionner tout
- **Ctrl+D** : Désélectionner tout  
- **Delete** : Supprimer la sélection
- **Ctrl+C** : Copier les URLs sélectionnées
- **F2** : Renommer l'album (si sur page album)

#### Raccourcis avancés
- **Ctrl+Shift+A** : Ajouter sélection à un album
- **Ctrl+S** : Basculer favori pour la sélection
- **Ctrl+L** : Basculer sécurité pour la sélection

### 5. **Aide contextuelle**

#### Modal d'aide (`Ctrl+?` ou bouton aide)
- **Liste des raccourcis** : Tableau organisé par catégorie
- **Conseils d'utilisation** : Guide rapide des fonctionnalités
- **Animations** : Démonstrations visuelles des interactions

## Structure de base de données

### Nouvelle table `albums`
```sql
CREATE TABLE albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  user_id TEXT, -- Pour le multi-utilisateur futur
  thumbnail_file TEXT, -- Nom du fichier pour l'aperçu
  file_count INTEGER DEFAULT 0
);
```

### Nouvelle table `album_files` (relation many-to-many)
```sql
CREATE TABLE album_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  file_name TEXT NOT NULL, -- Référence au nom du fichier
  added_at TEXT NOT NULL,
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  UNIQUE(album_id, file_name)
);
```

### Extension de la table `logs` existante
```sql
-- Ajouter de nouvelles actions pour le logging
-- 'album.create', 'album.delete', 'album.add_file', 'album.remove_file'
```

## Nouvelles routes API

### Albums
- **GET `/api/albums`** : Liste tous les albums
- **POST `/api/albums`** : Crée un nouvel album
- **GET `/api/albums/[id]`** : Détails d'un album
- **PUT `/api/albums/[id]`** : Modifier un album
- **DELETE `/api/albums/[id]`** : Supprimer un album

### Gestion des fichiers dans albums
- **POST `/api/albums/[id]/files`** : Ajouter des fichiers à un album
- **DELETE `/api/albums/[id]/files`** : Retirer des fichiers d'un album
- **GET `/api/albums/[id]/files`** : Lister les fichiers d'un album

### Opérations en lot
- **POST `/api/files/batch/add-to-album`** : Ajouter plusieurs fichiers à un album
- **POST `/api/files/batch/remove-from-albums`** : Retirer de tous les albums

## Nouvelles pages/composants

### Pages
1. **`app/(app)/albums/page.tsx`** : Page principale des albums
2. **`app/(app)/albums/[albumId]/page.tsx`** : Vue d'un album spécifique
3. **`app/(app)/albums/create/page.tsx`** : Création d'album (optionnel)

### Composants principaux
1. **`components/albums/album-grid.tsx`** : Grille d'albums
2. **`components/albums/album-card.tsx`** : Carte d'un album
3. **`components/albums/create-album-dialog.tsx`** : Modal de création
4. **`components/albums/add-to-album-dialog.tsx`** : Modal d'ajout à album

### Composants de multi-sélection
1. **`components/gallery/selection-toolbar.tsx`** : Barre d'actions pour sélection
2. **`components/gallery/multi-select-context-menu.tsx`** : Menu contextuel multi-sélection
3. **`components/gallery/selectable-file-card.tsx`** : FileCard avec sélection
4. **`components/gallery/keyboard-shortcuts-help.tsx`** : Modal d'aide

### Hooks personnalisés
1. **`hooks/use-multi-selection.ts`** : Logique de multi-sélection
2. **`hooks/use-keyboard-shortcuts.ts`** : Gestion des raccourcis
3. **`hooks/use-albums.ts`** : CRUD operations pour albums

## Types TypeScript

### Types d'albums
```typescript
export interface Album {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  thumbnailFile?: string;
  fileCount: number;
}

export interface AlbumFile {
  id: number;
  albumId: number;
  fileName: string;
  addedAt: string;
}
```

### Types de sélection
```typescript
export interface MultiSelection {
  selectedFiles: Set<string>;
  isSelecting: boolean;
  lastSelected?: string;
}

export interface SelectionAction {
  type: 'add' | 'remove' | 'clear' | 'range' | 'all';
  fileNames?: string[];
  rangeStart?: string;
  rangeEnd?: string;
}
```

## Traductions à ajouter

### Français (`lib/i18n/locales/fr.json`)
```json
{
  "albums": {
    "title": "Albums",
    "create": "Nouvel album",
    "name": "Nom de l'album",
    "description": "Description",
    "empty": "Aucun album créé",
    "files_count": "{count} fichier(s)",
    "add_files": "Ajouter des fichiers",
    "remove_from_album": "Retirer de l'album",
    "delete_album": "Supprimer l'album"
  },
  "multiselect": {
    "selected_count": "{count} fichier(s) sélectionné(s)",
    "select_all": "Tout sélectionner",
    "deselect_all": "Tout désélectionner",
    "add_to_album": "Ajouter à un album",
    "keyboard_shortcuts": "Raccourcis clavier"
  }
}
```

## Implémentation progressive

### Phase 1 : Fondations (Base de données + API)
1. Créer les tables SQLite pour albums
2. Développer les routes API de base
3. Types TypeScript et validation

### Phase 2 : Multi-sélection
1. Hook `use-multi-selection`
2. Composants SelectableFileCard et SelectionToolbar  
3. Intégration dans GridView et ListView

### Phase 3 : Context Menu
1. Intégration du composant Shadcn ContextMenu
2. Actions pour fichier unique et multiple
3. Sous-menu "Ajouter à un album"

### Phase 4 : Interface Albums
1. Pages albums principales
2. Composants AlbumCard et AlbumGrid
3. Dialogs de création et gestion

### Phase 5 : Raccourcis et aide
1. Hook `use-keyboard-shortcuts`
2. Modal d'aide avec liste des raccourcis
3. Intégration complète des interactions

### Phase 6 : Polissage
1. Animations et transitions
2. Tests d'accessibilité
3. Optimisations de performance
4. Documentation utilisateur

## Considérations techniques

### Performance
- **Virtualisation** : Pour les grandes listes d'albums/fichiers
- **Pagination** : API avec limite/offset pour éviter le chargement complet
- **Cache** : Mise en cache des métadonnées d'albums

### Accessibilité
- **ARIA labels** : Pour les éléments sélectionnables
- **Keyboard navigation** : Tab/Shift+Tab entre les éléments
- **Screen readers** : Annonces des sélections et actions

### Sécurité
- **Validation** : Tous les inputs d'albums via Zod
- **Permissions** : Vérifier que l'utilisateur peut modifier l'album
- **CSRF** : Protection contre les attaques cross-site

### Compatibilité
- **Mobile** : Adaptation des interactions tactiles
- **Navigateurs** : Support des raccourcis clavier moderne
- **ShareX** : Aucun impact sur les uploads existants

---

*Cette documentation servira de guide pour l'implémentation complète du système d'albums avec multi-sélection dans ShareX Manager.*


