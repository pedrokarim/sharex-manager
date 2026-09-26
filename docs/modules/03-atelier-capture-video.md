# 03 – Atelier capture vidéo

Retoucher rapidement un enregistrement d’écran fait avec ShareX : couper le
début et la fin, recadrer, accélérer, couper le son, ajouter une légende,
masquer une zone sensible, puis convertir en MP4 léger, WebM ou GIF.

- **Identifiant** : `video-workshop`
- **Libellé** : « Atelier vidéo »
- **Prérequis** : socle, partie vidéo (`ffmpeg`, vidéos dans les uploads,
  lecture avec `Range`, upload direct vers un module). Réutilise le rendu SVG
  pour les légendes.
- **Premier module vidéo réalisé** : il éprouve `ffmpeg`, la file de rendu et
  le lecteur sur un besoin simple, avant Clip Studio.

## 1. Pourquoi ce module

Un enregistrement d’écran brut commence presque toujours par le geste qui
lance l’enregistrement et finit par celui qui l’arrête. Il est souvent trop
lourd pour être partagé, et un GIF est parfois le seul format accepté. Ces
retouches prennent quelques secondes quand l’outil est à portée ; ici, il est
dans le menu contextuel de la vidéo.

## 2. Parcours

1. Clic droit sur une vidéo de la galerie, « Modules », « Ouvrir dans
   l’atelier vidéo ». Ou, pour aller plus vite, « Convertir en GIF » : même
   page, préréglage GIF déjà choisi.
2. La vidéo s’ouvre dans le lecteur, avec sa bande de vignettes et sa forme
   d’onde. Aucune retouche n’est encore appliquée.
3. L’utilisateur place les points d’entrée et de sortie (`I` et `O`, ou les
   poignées de la bande).
4. Il ajoute au besoin un recadrage, un changement de vitesse, une légende ou
   un masque.
5. « Exporter » ouvre le choix du format avec une **estimation de la taille**
   de chaque option. La file affiche la progression réelle d'`ffmpeg`.
6. À la fin : lecture du résultat, « Envoyer dans la galerie », « Copier le
   lien », « Télécharger ».

Toutes les retouches sont **non destructives** : l’original n’est jamais
modifié, un export produit toujours un nouveau fichier.

## 3. Interface

### 3.1 Disposition

```
┌──────────────────────────────────────────────────────────────────┐
│ Atelier vidéo │ Atelier  Exports                  Activité [Exporter]│ en-tête collant
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                 ┌────────────────────────────┐                   │
│                 │                            │                   │
│                 │        lecteur vidéo       │  ← cadre de       │
│                 │   (recadrage, légendes,    │    recadrage      │
│                 │    masques en surimpression)│    manipulable    │
│                 └────────────────────────────┘                   │
│        [✂ Couper][⬚ Recadrer][⏩ Vitesse][🔇 Son][T Légende][▒ Masque] │
├──────────────────────────────────────────────────────────────────┤
│ 0:00        0:05        0:10        0:15        0:20             │ règle
│ ▕[▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣▣]▏  vignettes, poignées entrée/sortie  │
│ ▁▂▅▇▅▂▁▁▂▃▆▇▆▃▂▁▁▁▂▅▇▅▂▁▁▂▃   forme d'onde                        │
│ ▬▬▬ légende 1 ▬▬▬      ▬ masque ▬                                 │ pistes
└──────────────────────────────────────────────────────────────────┘
```

- **Lecteur central**, à la taille maximale disponible. Les retouches sont
  prévisualisées en direct, sans rendu serveur : recadrage par
  `object-view-box` (ou `clip-path` en repli), vitesse par `playbackRate`,
  son par `muted`, légendes et masques en calques SVG synchronisés sur
  `currentTime`.
- **Barre d’outils sous le lecteur**, horizontale : chaque outil ouvre un
  petit panneau flottant (popover) au lieu d’une colonne de réglages.
- **Bande temporelle collante en bas** : règle, vignettes, forme d’onde,
  pistes des légendes et des masques. Poignées d’entrée et de sortie, tête de
  lecture déplaçable, zoom à la molette avec `Ctrl`.
- Les zones hors de l’intervalle conservé sont assombries dans la bande ; la
  durée finale s’affiche en permanence.

### 3.2 Raccourcis

| Touche | Action |
| --- | --- |
| `Espace` | Lecture ou pause |
| `I` / `O` | Point d’entrée ou de sortie à la tête de lecture |
| `←` / `→` | Image précédente ou suivante |
| `Maj ←` / `Maj →` | Une seconde en arrière ou en avant |
| `C` | Recadrage |
| `M` | Couper le son |
| `Ctrl E` | Exporter |

### 3.3 Menus contextuels

- **Sur une piste (légende, masque)** : Modifier, Dupliquer, Caler sur la
  tête de lecture, Supprimer.
- **Sur le lecteur** : Capturer cette image (PNG vers la galerie), Placer
  l’entrée ici, Placer la sortie ici.
- **Sur un export de l’historique** : Lire, Envoyer dans la galerie,
  Télécharger, Rouvrir les réglages, Supprimer.

### 3.4 Choix du format d’export

Une rangée de cartes, chacune avec sa taille estimée :

| Format | Réglages | Usage |
| --- | --- | --- |
| MP4 léger | H.264, CRF 26, `veryfast`, AAC 128k, `+faststart` | Partage courant |
| MP4 qualité | H.264, CRF 20, `medium` | Archive, montage |
| WebM | VP9, CRF 34, `-b:v 0`, `-row-mt 1`, `-cpu-used 4`, Opus | Web, poids minimal |
| GIF | 12 ou 15 i/s, largeur 480 à 800 px, palette optimisée | Messageries, documentation |
| Image | PNG à la tête de lecture | Illustration |

L’estimation vient de la durée finale, des dimensions et d’un débit moyen
par format mesuré sur les exports précédents (moyenne glissante gardée dans
les données du module). Pour le GIF, un avertissement apparaît au-delà de
15 Mo, avec les deux leviers les plus efficaces : réduire la largeur ou la
cadence.

## 4. Modèle de données

```ts
interface VideoEdit {
  source: MediaRef;
  trim: { startMs: number; endMs: number };
  crop?: { x: number; y: number; width: number; height: number }; // pixels source
  speed: number;                 // 0,25 à 4
  audio: { muted: boolean; volume: number }; // volume 0 à 2
  resize?: { maxWidth: number };
  captions: VideoCaption[];
  redactions: VideoRedaction[];
}

interface VideoCaption {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  position: "top" | "bottom" | "center";
  style: "subtitle" | "label";
}

interface VideoRedaction {
  id: string;
  box: { x: number; y: number; width: number; height: number }; // normalisé
  startMs: number;
  endMs: number;
  mode: "blur" | "pixelate" | "solid";
}

type ExportFormat =
  | { kind: "mp4"; quality: "light" | "high" }
  | { kind: "webm" }
  | { kind: "gif"; fps: 12 | 15; width: number }
  | { kind: "frame"; atMs: number };

interface WorkshopExport {
  id: string;
  edit: VideoEdit;
  format: ExportFormat;
  file: string;                  // data/exports/<id>.<ext>
  sizeBytes: number;
  durationMs: number;
  createdAt: number;
  savedToGallery?: string;
}
```

Les instants de `captions` et `redactions` sont exprimés dans le temps de la
**source**, pas de la sortie : changer la vitesse ou l’entrée ne décale pas
une légende déjà placée.

**Fichiers** (`modules/video-workshop/data/`, monté en volume) :

```
exports.json          historique
exports/              fichiers produits
cache/<hash>/         vignettes (planche), forme d'onde, métadonnées
tmp/<jobId>/          fichiers intermédiaires, supprimés en fin de travail
```

## 5. Chaîne de traitement `ffmpeg`

Toutes les commandes passent par `runFfmpeg` du socle (pas de shell,
progression, annulation, ressource `media-encode`).

### 5.1 Préparation, à l’ouverture d’une vidéo

Mise en cache par empreinte du fichier (taille, date, nom) :

- métadonnées : `ffprobe -show_format -show_streams -of json` ;
- planche de vignettes : `fps=<n>/<durée>,scale=160:-2,tile=<n>x1`, une
  seule image pour toute la bande ;
- forme d’onde : pics calculés sur l’audio décodé en PCM mono à 8 kHz,
  réduits à 1 000 valeurs, renvoyés en JSON et dessinés en SVG.

Ce travail est léger (quelques secondes) mais passe quand même par la file,
avec un libellé « Préparation » : la bande apparaît dès qu’il est prêt, le
lecteur est utilisable immédiatement.

### 5.2 Graphe de filtres de l’export

Construit dans cet ordre, à partir de `VideoEdit` :

1. **Coupe** : `-ss <start>` avant `-i` (recherche rapide), `-t <durée>`, et
   ré-encodage : la coupe est exacte à l’image près.
2. **Masques**, sur les pixels source, avant tout redimensionnement : pour
   chaque masque, une branche `crop`, puis `boxblur`, `scale` (pixellisation
   par réduction puis agrandissement en `neighbor`) ou `drawbox` plein, puis
   `overlay=x:y:enable='between(t,a,b)'`.
3. **Recadrage** : `crop=w:h:x:y`.
4. **Légendes** : chaque légende est rendue en PNG transparent par
   `renderSceneSvg` (mêmes polices que le reste de l’application), puis
   incrustée par `overlay=enable='between(t,a,b)'`. On évite `drawtext`,
   dont le rendu des polices et des accents diffère de l’aperçu.
5. **Vitesse** : `setpts=PTS/<vitesse>` pour l’image ; pour le son, chaîne de
   `atempo` (chaque maillon entre 0,5 et 2, par exemple `atempo=2,atempo=2`
   pour ×4).
6. **Taille** : `scale=<largeur>:-2:flags=lanczos`, dimensions paires.
7. **Encodage** selon le format (tableau du paragraphe 3.4).

Le GIF est produit en deux passes dans un seul graphe :
`split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`.

### 5.3 Cohérence entre l’aperçu et l’export

La seule source de vérité est `VideoEdit`. Une fonction pure
`buildFilterGraph(edit, format, probe)` produit les arguments `ffmpeg` ; elle
est testée par instantanés. L’aperçu du navigateur applique la même
description avec les moyens du navigateur ; les écarts connus (flou
légèrement différent, rendu des sous-pixels) sont acceptés.

## 6. Fonctions serveur

| Fonction | Rôle |
| --- | --- |
| `prepare(ref)` | Met en file la préparation ; renvoie les métadonnées et, quand elles sont prêtes, les URL de la planche et de la forme d’onde |
| `estimate(edit, format)` | Taille et durée d’encodage estimées |
| `enqueueExport(edit, format)` | Met en file l’export, renvoie l’identifiant du travail |
| `getWorkshopState()` | Travaux et derniers exports, en un seul appel (même principe que le studio) |
| `cancelExport(jobId)` | Annulation |
| `sendToGallery(exportId)` | Copie dans les uploads et `announceNewUpload` |
| `captureFrame(ref, atMs)` | PNG d’une image précise, envoyé directement à la galerie |
| `listExports()` / `deleteExport(id)` | Historique |

## 7. Intégration

```json
{
  "name": "video-workshop",
  "category": "Vidéo",
  "supportedFileTypes": [],
  "hasUI": false,
  "limits": { "maxUploadMb": 95 },
  "pages": [
    { "path": "", "title": "Atelier", "component": "pages/workshop.tsx" },
    { "path": "exports", "title": "Exports", "component": "pages/exports.tsx" }
  ],
  "navItems": [{ "title": "Atelier vidéo", "icon": "Clapperboard" }],
  "fileActions": [
    {
      "id": "open",
      "label": "Ouvrir dans l'atelier vidéo",
      "icon": "Clapperboard",
      "fileTypes": ["mp4", "webm", "mov", "mkv"],
      "maxFiles": 1,
      "page": ""
    },
    {
      "id": "gif",
      "label": "Convertir en GIF",
      "icon": "Film",
      "fileTypes": ["mp4", "webm", "mov", "mkv"],
      "maxFiles": 1,
      "page": "",
      "params": { "preset": "gif" }
    }
  ]
}
```

Liens avec les autres modules :

- **Tutoriels** : « Étapes depuis une vidéo » (placer des repères sur la
  bande, une étape par repère).
- **Clip Studio** : « Ajouter à un clip » sur un export.

## 8. Performances

- Un seul export à la fois sur la machine (ressource `media-encode`), deux
  fils d’exécution pour `ffmpeg`. Un deuxième export attend avec le libellé
  « En file d’attente », visible dans le fil et dans « Activité ».
- La préparation d’une vidéo de 2 min prend quelques secondes ; elle est mise
  en cache et n’est jamais refaite pour le même fichier.
- Le lecteur lit l’original par la route avec `Range` : l’ouverture d’une
  vidéo de 90 Mo ne télécharge que ce qui est lu.

## 9. Sécurité

- Les masques sont appliqués aux pixels par `ffmpeg` : la vidéo exportée ne
  contient plus l’information masquée. L’interface recommande « Aplat » pour
  les données sensibles.
- Les légendes sont échappées pour XML avant le rendu SVG.
- Les métadonnées de l’original (nom de l’appareil, emplacement pour une
  vidéo de téléphone) sont retirées par `-map_metadata -1`.
- Les références de source passent par `resolveMediaRef` ; aucun chemin libre
  n’atteint `ffmpeg`.

## 10. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| A1 | Lecteur, bande de vignettes, entrée et sortie, export MP4 léger et GIF, capture d’image, envoi à la galerie | Un enregistrement de 60 s coupé et converti en GIF arrive dans la galerie ; la coupe tombe à l’image près |
| A2 | Recadrage, vitesse, son, taille, WebM, estimation de taille, forme d’onde | L’estimation reste à ± 25 % de la taille réelle sur dix exports variés |
| A3 | Légendes et masques avec pistes temporelles | Un masque « Aplat » rend illisible la zone sur toutes les images de son intervalle |
| A4 | Conversion en lot depuis la galerie (plusieurs vidéos, même format) | Cinq vidéos converties à la suite, sans deux encodages simultanés |

## 11. Tests

- Unitaires : `buildFilterGraph` (instantanés par combinaison de
  retouches), chaîne `atempo`, conversion des instants source et sortie,
  estimation de taille.
- Intégration, dans le conteneur : exports réels de courtes vidéos de test
  versionnées (5 s, avec et sans son), contrôle de la durée et des dimensions
  par `ffprobe`.
- Navigateur : parcours du menu contextuel à l’envoi dans la galerie.

## 12. Questions ouvertes

- Sous-titres automatiques par transcription (Whisper par API) : très utile
  pour les tutoriels vidéo, à étudier après A3.
- Faut-il proposer « Remplacer l’original » (avec corbeille) pour ceux qui ne
  veulent pas garder deux versions ? Par défaut, non.
