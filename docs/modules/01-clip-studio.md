# 01 – Clip Studio

Monter un clip court à partir des images et vidéos de ShareX Manager :
diaporama animé, avant et après, présentation d’un projet, montage pour les
réseaux. Une timeline, des transitions, des titres, une musique, un export
MP4 aux formats 16:9, 9:16, 1:1 ou 4:5.

- **Identifiant** : `clip-studio`
- **Libellé** : « Clip Studio »
- **Prérequis** : socle complet (kit, rendu SVG, `ffmpeg`, vidéos dans les
  uploads, upload direct). Réutilise les légendes de l’Atelier vidéo et les
  scènes de Mockups.
- **Module le plus ambitieux** : il est découpé pour livrer de la valeur dès
  la première étape (diaporama automatique), bien avant la timeline complète.

## 0. Mise à jour : décisions prises à la réalisation

L’étape 1 (éditeur) est réalisée dans `modules/clip-studio/`. Plusieurs
choix de ce dossier ont été revus en la construisant ; ils priment sur les
sections suivantes quand elles divergent.

### Rendu dans le navigateur, pas sur le serveur

L’aperçu **et** l’export se font dans le navigateur, par une seule fonction
de dessin (`engine/render.ts`, `drawFrame`) sur un canevas 2D :

- **aperçu** : `engine/preview.ts`, horloge de l'`AudioContext`, son mixé par
  la Web Audio API, vidéos muettes recalées sur cette horloge ;
- **export** : `engine/export.ts`, chaque image est dessinée puis encodée en
  H.264 par WebCodecs via **Mediabunny** (MPL-2.0) ; les vidéos sources sont
  décodées à l’instant exact demandé (`CanvasSink.canvasesAtTimestamps`), le
  son est mixé hors temps réel par un `OfflineAudioContext` ;
- le serveur ne reçoit que le MP4 final, par la route d’upload des modules.

Conséquences : aucune charge de rendu sur `ascencia-prod`, et ce que l’on
voit dans l’éditeur est exactement ce qui sort dans le fichier. Le graphe
`ffmpeg` décrit plus bas (paragraphe 5.2) n’est plus nécessaire pour
l’export ; il reste une piste pour un futur rendu serveur (génération
automatique hors navigateur).

### Pourquoi pas Remotion, ni le code d’OpenVideo

Les deux références étudiées (Remotion, et l’éditeur de DesignCombo devenu
OpenVideo) sont sous licence double : gratuites pour un particulier ou une
structure de trois personnes au plus, payantes au-delà, avec une licence
dédiée aux outils « prompt vers vidéo ». ShareX Manager est publié sous
GPL v3 : en faire une dépendance créerait une incompatibilité de licence et
imposerait une contrainte à chaque personne qui auto-héberge le projet.
Mediabunny, sous MPL-2.0, est compatible ; le moteur est écrit dans le
projet.

### Modèle de projet

Tout est en images à la cadence du projet (30 i/s), positions relatives au
canevas (`engine/types.ts`). Pistes visuelles superposées (la première est
dessinée au-dessus) et pistes audio ; éléments image, vidéo, texte, forme
(dont une barre de compte à rebours) et son. Les opérations d’édition sont
des fonctions pures (`engine/edit.ts`), ce qui rend l’annulation triviale.

### Plateforme

Ajoutés pour ce module et réutilisables par tous :

- route `POST /api/modules/<nom>/upload` (déclarée par `uploads` dans
  `module.json`, type contrôlé par signature, écriture en flux) ;
- route de données en flux avec `Range` (`lib/modules/media-response.ts`),
  limitée aux types média : elle ne sert plus les fichiers JSON internes
  d’un module (dont `secrets.json` et ses clés API) et valide le nom du
  module.

### Feuille de route révisée

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Éditeur : projets, timeline multipiste (déplacer, rogner, scinder, aimanter), aperçu, images, vidéos, sons, textes animés et styles, formes, compte à rebours, export MP4, diaporama depuis la galerie | Réalisée |
| 2 | Modèles de projet (Quiz, Top, Diaporama), remplis à partir de données structurées (`engine/templates.ts`) ; Avant / Après reste à faire | Réalisée |
| 3 | Assistant IA : « fais-moi un short quiz sur les animaux ». Script écrit par Codex CLI (`lib/codex.ts`), illustrations demandées à la file d’AI Image Gen, projet monté par un modèle (`lib/assistant.ts`) | Réalisée |
| 4 | Voix de synthèse : Piper en local (gratuit, quatre voix françaises sous licence libre), téléchargé au premier démarrage dans les données du module et non dans l’image Docker (`lib/resources.ts`, `lib/tts.ts`) ; panneau Voix dans l’éditeur ; narration par l’assistant, chaque segment s’allongeant à la durée de sa lecture. Restent : moteurs par clé API (OpenAI, Google, ElevenLabs) et sous-titres mot à mot | Réalisée en partie |
| 5 | Galerie vidéo (socle, partie vidéo) pour envoyer les clips dans la galerie. Nginx est fait : 100 Mo sur `/api/modules/*/upload` (sans mise en tampon), 20 Mo explicites ailleurs, dans le seul fichier du site | À faire en partie |
| 6 | Banque de musique libre de droits : sélection de base versionnée (`music/library.json`, morceaux Jamendo sous CC0 ou CC BY via Openverse), téléchargée au démarrage dans les données du module ; recherche et ajout depuis l’éditeur (onglet Découvrir) ; musique de fond choisie par l’assistant selon l’ambiance ; crédits rappelés à l’export | Réalisée |

## 1. Pourquoi ce module

Les rendus d’AI Image Gen, les captures d’un projet ou les enregistrements
d’écran racontent souvent une histoire qui gagne à être montée : une série de
visuels générés, l’évolution d’une interface, une démonstration. Un
diaporama propre avec musique se fait en une minute ; un vrai montage reste
possible pour qui veut aller plus loin.

## 2. Parcours

### 2.1 Création express

1. Dans la galerie (ou dans le fil d’AI Image Gen), sélection de plusieurs
   images, clic droit, « Modules », « Créer un clip avec la sélection ».
2. Une fenêtre demande deux choses seulement : le **format** (16:9, 9:16,
   1:1, 4:5, avec aperçu de la forme) et la **recette** :
   - **Diaporama** : 3 s par image, mouvement de caméra lent alterné, fondus
     enchaînés de 0,6 s ;
   - **Avant / Après** : images par paires, balayage de l’une à l’autre ;
   - **Rythmé** : 1,2 s par image, coupes franches, zooms courts.
3. Le projet s’ouvre dans l’éditeur, déjà monté, lecture lancée. Il reste à
   ajouter une musique ou un titre, ou à exporter directement.

### 2.2 Montage

Dans l’éditeur : réordonner, raccourcir, couper, changer une transition,
ajouter un titre, régler le mouvement d’une image, placer la musique, puis
exporter. L’export passe par la file ; le résultat se lit, s’envoie dans la
galerie ou se télécharge.

## 3. Interface

### 3.1 Page « Projets »

Grille de cartes : image de couverture, nom, format, durée, date. Survol :
lecture muette de l’aperçu du dernier export. Menu contextuel : Ouvrir,
Dupliquer, Changer de format (crée une copie adaptée), Exporter, Supprimer.
Bouton « Nouveau clip » : même fenêtre que la création express, avec
sélection des médias par le `MediaPicker` du kit.

### 3.2 Éditeur

```
┌─────────────────────────────────────────────────────────────────────┐
│ Clip Studio │ Nom du clip ✎  16:9 ▾      ⟲ ⟳   Activité  [Exporter] │ en-tête collant
├──────────┬──────────────────────────────────────────┬───────────────┤
│ Médias   │                                          │ Inspecteur    │
│ (tiroir, │          ┌────────────────────┐          │ (apparaît     │
│  touche  │          │                    │          │  avec une     │
│  M)      │          │   aperçu du clip   │          │  sélection,   │
│          │          │                    │          │  sinon masqué)│
│          │          └────────────────────┘          │               │
│          │        ◀◀  ▶  ▶▶   0:07 / 0:24           │               │
├──────────┴──────────────────────────────────────────┴───────────────┤
│ 0:00    0:05    0:10    0:15    0:20                       zoom ─●─ │ règle
│ Titres    ▬▬ Titre ▬▬                ▬ Légende ▬                    │
│ Principale [img1][⋈][img2 ][⋈][vidéo3      ][⋈][img4][img5]        │ piste magnétique
│ Audio     ▁▂▅▇▅▂▁▁▂▃▆▇▆▃▂▁▁▁▂▅▇▅▂▁▁▂▃▆▇▆▃▂▁  musique.mp3          │
└─────────────────────────────────────────────────────────────────────┘
```

- **Aperçu central**, aux proportions du format, lecture en temps réel dans
  le navigateur (voir 5.3).
- **Tiroir « Médias » à gauche**, fermé par défaut (`M`) : le `MediaPicker`
  du kit intégré (uploads, rendus d’AI Image Gen, exports de l’Atelier vidéo,
  musiques du module). On glisse un média du tiroir vers une piste.
- **Inspecteur à droite**, présent seulement quand un élément est
  sélectionné : on ne garde pas une colonne de réglages vide ouverte en
  permanence.
- **Timeline en bas**, sur toute la largeur, collante : règle avec zoom, tête
  de lecture, trois pistes :
  - **Principale**, magnétique : les plans s’enchaînent sans trou ;
    supprimer un plan resserre la piste ; les transitions (`⋈`) sont des
    pastilles entre deux plans ;
  - **Titres et superpositions**, libre : titres, légendes, logo ;
  - **Audio** : musique et voix off, avec forme d’onde et fondus.
- Réordonnancement animé avec `framer-motion` (`layout`) : les plans voisins
  glissent pour laisser la place.
- Magnétisme : les bords se calent sur la tête de lecture, les autres bords
  et les secondes rondes, avec un trait de repère pendant le glissement.

### 3.3 Inspecteur selon la sélection

| Sélection | Réglages |
| --- | --- |
| Plan image | Durée, cadrage (remplir ou contenir, fond flou si contenir), mouvement de caméra (aucun, zoom avant, zoom arrière, panoramique gauche ou droite, personnalisé avec points de départ et d’arrivée tracés sur l’aperçu), courbe d’accélération |
| Plan vidéo | Entrée et sortie dans la source, vitesse, volume, cadrage |
| Transition | Type (fondu, fondu au noir, glissement, balayage, zoom, coupe franche), durée |
| Titre | Texte, style (préréglages de titres issus du moteur de scènes), position, animation d’entrée et de sortie (fondu, glissement, apparition), durée |
| Audio | Entrée dans la source, volume, fondu d’entrée et de sortie, « Adapter la durée du clip à la musique » |
| Rien | Format, cadence (30 i/s par défaut), couleur de fond, durée totale |

### 3.4 Raccourcis

| Touche | Action |
| --- | --- |
| `Espace` | Lecture ou pause |
| `J` / `K` / `L` | Arrière, pause, avant (accélération par appuis successifs) |
| `S` | Scinder le plan à la tête de lecture |
| `Suppr` | Supprimer et resserrer |
| `Ctrl Z` / `Ctrl Maj Z` | Annuler, rétablir (historique de 100 états) |
| `Ctrl D` | Dupliquer |
| `+` / `-` | Zoom de la timeline |
| `M` | Tiroir des médias |

### 3.5 Menus contextuels

- **Plan** : Scinder ici, Dupliquer, Remplacer le média, Mouvement ▸
  (préréglages), Transition suivante ▸, Ouvrir dans l’Atelier vidéo (plan
  vidéo), Supprimer.
- **Transition** : Type ▸, Durée ▸ (0,3 / 0,6 / 1 s), Supprimer.
- **Titre** : Style ▸, Animation ▸, Dupliquer, Supprimer.
- **Piste vide** : Coller, Ajouter un titre ici, Ajouter une musique.

## 4. Modèle de données

```ts
interface ClipProject {
  id: string;
  name: string;
  format: {
    aspect: "16:9" | "9:16" | "1:1" | "4:5";
    width: number;              // 1920, 1080…
    height: number;
    fps: 30;
  };
  background: string;           // couleur des bandes en mode « contenir »
  main: MainClip[];             // piste magnétique, dans l'ordre
  overlays: OverlayClip[];
  audio: AudioClip[];
  createdAt: number;
  updatedAt: number;
  exports: ClipExport[];
}

interface MainClip {
  id: string;
  ref: MediaRef;
  kind: "image" | "video";
  durationMs: number;
  /** Vidéo seulement : où commence le plan dans la source. */
  sourceInMs?: number;
  speed?: number;
  volume?: number;
  fit: "cover" | "contain";
  motion?: CameraMotion;
  /** Transition vers le plan suivant. */
  transitionOut?: { kind: TransitionKind; durationMs: number };
}

interface CameraMotion {
  /** Cadrage de départ et d'arrivée, en coordonnées normalisées. */
  from: { cx: number; cy: number; zoom: number };
  to: { cx: number; cy: number; zoom: number };
  easing: "linear" | "ease-in-out";
}

type TransitionKind =
  | "cut" | "fade" | "fadeblack" | "slideleft" | "slideright"
  | "wipeleft" | "wiperight" | "zoomin";

interface OverlayClip {
  id: string;
  startMs: number;
  durationMs: number;
  scene: Scene;                 // moteur de scènes du socle
  enter: "none" | "fade" | "slide-up" | "pop";
  exit: "none" | "fade" | "slide-down";
}

interface AudioClip {
  id: string;
  ref: MediaRef;
  startMs: number;
  sourceInMs: number;
  durationMs: number;
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
}

interface ClipExport {
  id: string;
  file: string;
  quality: "preview" | "final";
  durationMs: number;
  sizeBytes: number;
  createdAt: number;
  savedToGallery?: string;
}
```

La position d’un plan principal dans le temps n’est pas stockée : elle se
déduit de l’ordre, des durées et des transitions. C’est ce qui rend la piste
magnétique sans code de résolution de conflits.

**Fichiers** (`modules/clip-studio/data/`, monté en volume) :

```
projects/<id>.json    un fichier par projet, magasin JSON atomique
audio/                musiques importées par l'utilisateur
proxies/<hash>.mp4    copies légères des vidéos pour l'aperçu
titles/<hash>.png     titres rendus, mis en cache par empreinte de scène
exports/              clips produits
tmp/<jobId>/          fichiers intermédiaires
```

## 5. Moteur

### 5.1 Chronologie : une seule fonction de vérité

`lib/timeline.ts`, pure et partagée entre le navigateur et le serveur :

```ts
/** Où commence chaque plan, compte tenu des chevauchements de transitions. */
function layoutMain(project: ClipProject): PlacedClip[];

/** Ce qui est visible et audible à l'instant t. */
function frameAt(project: ClipProject, tMs: number): FrameState;

/** Cadrage d'un plan image à l'instant t de ce plan. */
function cameraAt(motion: CameraMotion, progress: number): Viewport;
```

L’aperçu du navigateur et le graphe `ffmpeg` sont tous deux construits à
partir de ces fonctions : un plan ne peut pas durer 3 s dans l’aperçu et
3,2 s à l’export.

### 5.2 Export : génération du graphe `ffmpeg`

`buildClipGraph(project)` produit les entrées et un `filter_complex` :

1. **Plans image** : `-loop 1 -t <durée> -i <image>`, puis redimensionnement
   à 2 × la sortie, puis mouvement de caméra par `zoompan` avec des
   expressions calculées depuis `CameraMotion`. Le suréchantillonnage évite
   les tremblements typiques de `zoompan` à pleine résolution. À mesurer :
   si le coût est trop élevé, repli sur un rendu image par image du mouvement
   avec `sharp` dans un dossier temporaire.
2. **Plans vidéo** : `-ss <entrée> -t <durée>` sur l’original (pas le
   proxy), `setpts` pour la vitesse, `scale` et `crop` (remplir) ou `scale`,
   `pad` et fond flou (contenir), `fps=30`, `setsar=1`, `format=yuv420p`.
3. **Transitions** : chaînage de `xfade=transition=<type>:duration=<d>:offset=<o>`
   pour l’image, `acrossfade` pour le son, avec les décalages calculés par
   `layoutMain`.
4. **Titres** : chaque scène rendue une fois en PNG transparent (cache par
   empreinte), bouclée sur sa durée, animée par `fade=t=in:alpha=1` et un
   `overlay` à coordonnées dépendantes du temps pour les glissements, activée
   par `enable='between(t,a,b)'`.
5. **Audio** : sons des plans vidéo et pistes audio mixés par `amix`
   (`normalize=0`), volumes par `volume`, fondus par `afade`, puis
   `loudnorm=I=-16:TP=-1.5` en une passe (deux passes en v2).
6. **Sortie** : H.264 High, CRF 20, `veryfast`, AAC 160k, `+faststart`,
   `-threads 2`.

Durée maximale d’un projet en v1 : **3 minutes**. Au-delà, le graphe devient
difficile à tenir en une passe ; la v2 rendra par segments puis assemblera
avec le démultiplexeur `concat`.

### 5.3 Aperçu en temps réel

Le navigateur n’attend jamais le serveur pour montrer le montage :

- un `<canvas>` aux dimensions du format, redessiné à chaque image par
  `requestAnimationFrame` à partir de `frameAt(project, t)` ;
- images : `drawImage` avec le cadrage de `cameraAt` ;
- vidéos : éléments `<video>` cachés, lus depuis les **proxies** 540p, calés
  sur le temps de la timeline ;
- transitions : fondus et glissements reproduits par composition sur le
  canevas ;
- titres : SVG de la scène rastérisé une fois en `ImageBitmap` ;
- audio : Web Audio API, un nœud de gain par piste, pour des fondus
  identiques à l’export.

« Aperçu exact » lance en plus un export en 480p (`ultrafast`, CRF 30), pour
vérifier le rendu réel avant l’export final.

### 5.4 Proxies

À l’ajout d’une vidéo au projet, un travail léger produit un proxy 540p
(`veryfast`, CRF 28, images clés toutes les 15 images pour un déplacement
fluide). La vidéo est utilisable immédiatement ; l’aperçu passe sur le proxy
dès qu’il est prêt, sans que l’utilisateur ait à le savoir.

## 6. Fonctions serveur

| Fonction | Rôle |
| --- | --- |
| `listProjects()` / `getProject(id)` | Lecture |
| `createProject({ refs, aspect, recipe })` | Crée un projet monté selon une recette |
| `saveProject(project)` | Enregistrement automatique, contrôle de version optimiste |
| `duplicateProject(id, aspect?)` | Copie, avec adaptation du cadrage si le format change |
| `importAudio(ref)` | Copie une musique uploadée dans `audio/` et calcule sa forme d’onde |
| `ensureProxy(ref)` | Met en file la création du proxy d’une vidéo |
| `enqueueExport(projectId, quality)` | Export aperçu ou final |
| `getStudioState(projectId)` | Travaux en cours et exports, en un appel |
| `cancelExport(jobId)` | Annulation |
| `sendToGallery(projectId, exportId)` | Copie dans les uploads et `announceNewUpload` |

## 7. Intégration

```json
{
  "name": "clip-studio",
  "category": "Vidéo",
  "supportedFileTypes": [],
  "hasUI": false,
  "limits": { "maxUploadMb": 95 },
  "pages": [
    { "path": "", "title": "Projets", "component": "pages/projects.tsx" },
    { "path": "edit", "title": "Éditeur", "component": "pages/editor.tsx" }
  ],
  "navItems": [{ "title": "Clip Studio", "icon": "Film" }],
  "fileActions": [
    {
      "id": "create",
      "label": "Créer un clip avec la sélection",
      "icon": "Film",
      "fileTypes": ["png", "jpg", "jpeg", "webp", "mp4", "webm", "mov"],
      "maxFiles": 60,
      "page": "",
      "params": { "action": "create" }
    }
  ]
}
```

- **AI Image Gen** : « Créer un clip » sur une série (collection) ou une
  sélection de rendus, par références `module:`.
- **Atelier vidéo** : « Ajouter à un clip » sur un export.
- **Animer une image** : les vidéos générées sont proposées dans le tiroir
  des médias.

## 8. Musique et droits

Le module ne fournit **aucune musique** : aucune banque de sons n’est
embarquée, pour ne pas avoir à gérer de licences. L’utilisateur importe ses
propres fichiers (MP3, M4A, WAV, OGG). La page d’import le rappelle en une
phrase.

## 9. Performances

- Export final : un seul à la fois sur la machine (ressource
  `media-encode`). Ordre de grandeur à mesurer : un clip 1080p de 30 s avec
  dix plans et des transitions devrait prendre entre 30 s et 2 min.
- L’estimation de durée affichée avant l’export s’appuie sur les exports
  précédents (secondes de calcul par seconde de clip, moyenne glissante).
- Aperçu : aucune charge serveur pendant l’édition, hors proxies.
- L’enregistrement automatique n’envoie que le projet, jamais les médias.

## 10. Sécurité

- Toutes les sources passent par `resolveMediaRef`.
- Les textes des titres sont échappés pour XML avant le rendu SVG.
- `buildClipGraph` n’insère jamais un texte saisi dans une expression de
  filtre `ffmpeg` : les titres sont des images, pas du `drawtext`. C’est
  aussi ce qui ferme la porte aux injections dans le graphe de filtres.
- Les métadonnées des sources sont retirées (`-map_metadata -1`).

## 11. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| C1 | Création express : images seules, recettes Diaporama et Rythmé, formats, musique, export ; édition réduite à une liste réordonnable avec durée par plan | Depuis la galerie, dix images deviennent un clip 9:16 avec musique en moins de trois minutes, export compris |
| C2 | Timeline complète : piste magnétique, scinder, raccourcir, transitions par plan, mouvement de caméra réglable, annuler et rétablir | Un clip modifié par la timeline s’exporte avec des durées identiques à l’aperçu, à l’image près |
| C3 | Plans vidéo, proxies, audio des plans, mixage, fondus, `loudnorm` | Une capture vidéo et deux images se montent avec la musique, sans décalage du son |
| C4 | Titres et superpositions, styles, animations, recette Avant / Après | Un titre s’affiche au même endroit et au même moment dans l’aperçu et l’export |
| C5 | Changement de format d’un projet, rendu par segments, projets de plus de 3 min | À définir après C4 |

## 12. Tests

- Unitaires : `layoutMain`, `frameAt`, `cameraAt` (cas limites :
  transitions plus longues qu’un plan, plan de durée minimale, dernier plan
  sans transition) et `buildClipGraph` par instantanés.
- Intégration, dans le conteneur : exports de projets de test, contrôle de
  la durée (`ffprobe`) à une image près et de la présence du son.
- Navigateur : création express depuis la galerie jusqu’à l’envoi du clip
  dans la galerie.

## 13. Questions ouvertes

- Caler automatiquement les coupes sur le rythme de la musique (détection
  des temps forts) : très apprécié pour la recette « Rythmé », à étudier
  après C3.
- Sous-titres importés depuis un fichier SRT, ou générés par transcription.
- Modèles de projet partageables (un habillage de titres réutilisable).
