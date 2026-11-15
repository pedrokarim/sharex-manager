# Organisation des fichiers : tags et collections

Dossier ouvert le 15/11/2026. La barre latérale avait trois liens vers des
pages qui n'existaient pas : Tags, Collections et Intégrations. Ce dossier
couvre les deux premières, et la page 404 qui manquait aussi.

## 1. Trois façons de ranger, trois usages

| | Rempli par | Portée | Sert à |
| --- | --- | --- | --- |
| **Album** (existe) | La main : on y ajoute des fichiers | Un compte, partageable en public | Montrer une sélection, la publier |
| **Tag** | La main : on pose des étiquettes sur les fichiers | Toute l'instance, comme les favoris | Décrire un fichier, le retrouver |
| **Collection** | Des règles, recalculées à chaque ouverture | Un compte, privée | Garder une recherche sous la main |

Un tag dit ce qu'est un fichier (« Valorant », « reçu », « maquette »). Une
collection dit ce que l'on veut voir (« les vidéos taguées Valorant des
30 derniers jours »). Un nouveau fichier qui reçoit le tag entre de lui-même
dans la collection ; dans un album, il faudrait l'ajouter.

## 2. Stockage

Une base SQLite à part, `data/organization.db`, sur le modèle de
`albums.db` (`bun:sqlite`, WAL, tables créées au premier accès) :

```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE file_tags (
  file_name TEXT NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  added_by TEXT,
  PRIMARY KEY (file_name, tag_id)
);
CREATE INDEX idx_file_tags_tag ON file_tags(tag_id);

CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  rules TEXT NOT NULL,          -- CollectionRules en JSON
  sort TEXT NOT NULL DEFAULT 'date',
  sort_order TEXT NOT NULL DEFAULT 'desc',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, slug)
);
```

Les types partagés sont dans `src/lib/organization/types.ts` ; l'accès à la
base dans `src/lib/organization/organization-db.ts`.

- Un fichier est désigné par son nom, comme dans `album_files` : la
  suppression d'un fichier (`DELETE /api/files/[filename]`, suppression en
  lot) retire aussi ses tags.
- Le nombre de fichiers d'un tag ne compte que les fichiers encore sur le
  disque : la liste des tags croise `file_tags` avec le dossier d'envoi.
- Deux noms qui donnent le même slug sont le même tag (« Jeu vidéo » et
  « jeu-video ») : créer le second renvoie le premier.

## 3. Règles d'une collection

`CollectionRules` (voir le fichier de types). Toutes les conditions présentes
doivent être vraies :

- `tagsAll` : porte tous ces tags ; `tagsAny` : au moins un ; `tagsNone` :
  aucun ;
- `kinds` : image, vidéo ou autre fichier (`fileKind`) ;
- `starred`, `secure` : `true` seulement ceux-là, `false` tous sauf ceux-là ;
- `period` : `{ lastDays }` ou `{ from, to }` ;
- `search` : texte dans le nom.

Une collection sans aucune règle est refusée (elle serait la galerie
entière). Un tag supprimé disparaît des règles qui le citent ; un tag
renommé prend le slug de son nouveau nom quand il est libre, et les
règles qui le citent sont réécrites ; deux tags fusionnés ne laissent dans
les règles que le tag gardé. Une collection dont il ne reste aucune règle ne
montre rien, jamais toute la galerie.

L'évaluation passe par la liste de la galerie (`listGalleryFiles`), qui gagne
deux filtres : `tags` (slugs, tous requis) et `collection` (règles
complètes). La table `file_tags` est lue une fois par liste, pas une fois par
fichier.

## 4. API

Toutes les routes demandent une session ; les tags sont communs, les
collections lues et écrites par leur propriétaire seul.

| Route | Rôle |
| --- | --- |
| `GET /api/tags` | Tous les tags, avec `fileCount` et `lastUsedAt` |
| `POST /api/tags` | Créer `{ name, description? }` (renvoie l'existant au même slug) |
| `PATCH /api/tags/[id]` | Renommer, décrire (créateur ou admin) |
| `DELETE /api/tags/[id]` | Supprimer, et le retirer des fichiers (créateur ou admin) |
| `POST /api/tags/[id]/merge` | Fusionner dans `{ into }` : les fichiers gardent l'autre tag (admin) |
| `GET /api/files/[filename]/tags` | Tags d'un fichier |
| `PUT /api/files/[filename]/tags` | Remplacer `{ tags: string[] }` (noms ; les nouveaux sont créés) |
| `POST /api/files/tags/batch` | `{ files, add?, remove? }` pour une sélection |
| `GET /api/collections` | Collections du compte, avec `fileCount` et `cover` |
| `POST /api/collections` | Créer |
| `GET/PATCH/DELETE /api/collections/[id]` | Lire, modifier, supprimer |
| `POST /api/collections/preview` | Reçoit `{ rules }`, rend `{ fileCount, cover }` pour l'éditeur |
| `GET /api/files?tag=a&tag=b` | Galerie filtrée par tags (tous requis) |
| `GET /api/files?collection=<id>` | Galerie d'une collection |

## 5. Écrans

Même ligne que le reste du back-office : en-tête léger (icône du jeu du
thème, titre, phrase), pleine largeur, des tableaux et des panneaux, les
retours affichés à côté de l'action, chargements localisés,
listes animées. Pas de pastilles de couleur pour les tags : un tag est un
mot, pas une couleur.

- Tags (`/organization/tags`) : un tableau filtrable (nom, fichiers,
  dernière pose, créateur), tri par colonne, création en ligne, renommage
  sur place, fusion et suppression dans un menu. Un clic sur un tag ouvre la
  galerie filtrée (`/gallery?tag=<slug>`). État vide : une phrase et le
  champ de création.
- **Poser des tags** : dans la galerie, le menu d'un fichier (« Tags… ») et
  la barre de sélection (« Ajouter des tags », « Retirer des tags ») ouvrent
  un champ à suggestions qui crée un tag inconnu à la volée ; la visionneuse
  d'un fichier montre ses tags et permet d'en ajouter. La galerie filtrée
  par tag le dit dans sa barre d'outils, avec de quoi retirer le filtre.
- Collections (`/organization/collections`) : une grille de collections
  (aperçu de quatre fichiers, nom, nombre, règles résumées en une ligne),
  épinglées d'abord ; « Nouvelle collection » ouvre l'éditeur.
- **Éditeur de collection** : un panneau de règles (tags avec, au moins un,
  sans ; types ; favoris ; sécurisés ; période ; texte), avec le nombre de
  fichiers et l'aperçu recalculés pendant la saisie (demande retardée de
  300 ms). Nom, description, tri.
- Une collection (`/organization/collections/[slug]`) : la galerie
  filtrée par ses règles, avec son en-tête (nom, règles résumées, modifier).
- Page 404 (`src/app/not-found.tsx`) : dans le style des pages publiques
  (en-tête photo, `src/components/front/`), une phrase, un lien vers
  l'accueil et un vers la galerie pour un compte connecté.

## 6. Découpage

| Étape | Contenu | Fini quand |
| --- | --- | --- |
| O1 | Base, accès, filtres de la galerie, routes, nettoyage à la suppression d'un fichier | Tests de la base (sous-processus Bun) et des routes verts |
| O2 | Page Tags, pose des tags dans la galerie et la visionneuse, galerie filtrée par tag | Poser un tag sur un fichier depuis la galerie le fait apparaître dans `/organization/tags` et dans `/gallery?tag=` |
| O3 | Page Collections, éditeur avec aperçu, page d'une collection | Une collection « vidéos taguées X » montre les bons fichiers et suit un nouveau tag sans rien refaire |
| O4 | Page 404 | Une adresse inconnue montre la page, en clair et en sombre, à 390 et 1440 px |

Le lien Intégrations (`/settings/integrations`) reste en suspens : il n'a pas
de contenu prévu.
