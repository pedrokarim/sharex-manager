# 04 – Mockups

Poser une capture d’écran dans un cadre soigné (fenêtre de navigateur,
téléphone, tablette, simple fenêtre) sur un fond travaillé, puis l’exporter
aux bons formats pour un article, un réseau social ou une présentation.

- **Identifiant** : `mockups`
- **Libellé** : « Mockups »
- **Prérequis** : socle, partie images (kit, rendu SVG serveur, polices).
- **Premier module réalisé après le socle** : il valide le kit et le rendu SVG
  sans la complexité de la vidéo.

## 1. Pourquoi ce module

ShareX Manager contient plus de 13 000 captures. Les partager telles quelles
donne des images brutes, sans contexte ni finition. Des outils comme Shots,
Screely ou CleanShot le font très bien, mais obligent à télécharger la
capture, l’ouvrir ailleurs, puis la renvoyer. Ici, tout part de la galerie et
y revient.

## 2. Parcours

1. Dans la galerie, clic droit sur une ou plusieurs captures, section
   « Modules », « Créer un mockup ». L’atelier s’ouvre avec les captures
   chargées.
2. L’atelier affiche immédiatement la première capture dans le **dernier
   préréglage utilisé**. Aucune configuration n’est nécessaire pour obtenir un
   résultat présentable.
3. L’utilisateur fait défiler les préréglages en bas de l’écran ; chacun
   montre sa vraie capture, pas une image d’exemple.
4. Il ajuste au besoin (fond, cadre, marges, ombre, format de sortie).
5. « Exporter » produit l’image. « Envoyer dans la galerie » la dépose dans
   les uploads, où elle apparaît immédiatement.
6. Avec plusieurs captures, « Appliquer à toutes » exporte le lot avec le même
   réglage.

Accès secondaires : page du module depuis la barre latérale, bouton
« Mockup » dans la barre des modules de la visionneuse, et entrée
« Mockup » dans le menu d’une génération d’AI Image Gen (par référence
`module:`).

## 3. Interface

### 3.1 Disposition de l’atelier

L’atelier est un espace de travail plein écran, pas un formulaire.

```
┌──────────────────────────────────────────────────────────────┐
│ Mockups │ Atelier  Préréglages  Historique        [Exporter ▾]│  en-tête collant
├──────────────────────────────────────────────┬───────────────┤
│                                              │ Cadre         │
│                                              │ Fond          │
│            ┌──────────────────────┐          │ Mise en page  │  inspecteur
│            │  ● ● ●  exemple.com  │          │ Ombre         │  repliable
│            │                      │          │ Format        │  (touche I)
│            │      capture         │          │               │
│            └──────────────────────┘          │               │
│                                              │               │
├──────────────────────────────────────────────┴───────────────┤
│ [▣][▣][▣][▣][▣][▣]  préréglages rendus avec la vraie capture   │  bande collante
│ ◀ capture 2 / 7 ▶   ○○●○○○○                                   │  (lot)
└──────────────────────────────────────────────────────────────┘
```

- **Canevas central.** Aperçu SVG exact (voir socle, rendu SVG), centré, mis à
  l’échelle pour tenir dans la zone. Damier en fond quand l’arrière-plan est
  transparent. Molette et `Ctrl +`/`Ctrl -` pour zoomer, `0` pour ajuster.
- **Inspecteur à droite**, repliable (`I`) : sections accordéon, une seule
  ouverte à la fois par défaut. Replié, le canevas prend toute la largeur.
- **Bande des préréglages en bas**, collante : vignettes rendues avec la
  capture courante, défilement horizontal, préréglage actif mis en avant par
  une pastille qui glisse (`layoutId`). Survol : aperçu temporaire sur le
  canevas ; clic : application.
- **Navigation dans le lot** sous la bande quand plusieurs captures sont
  chargées ; `←`/`→` changent de capture.
- Sur mobile, l’inspecteur devient une feuille qui monte du bas, la bande des
  préréglages reste visible.

### 3.2 Contenu de l’inspecteur

| Section | Réglages |
| --- | --- |
| Cadre | Aucun, fenêtre simple, navigateur (styles macOS, Windows, minimal ; clair ou sombre ; texte de la barre d’adresse), téléphone, tablette, ordinateur portable ; couleur de coque |
| Fond | Uni, dégradé linéaire ou radial (angle, arrêts), maillage (graine, couleurs), image floutée (une autre capture ou la capture elle-même), transparent ; bouton « Couleurs de la capture » |
| Mise en page | Marges (en % de la plus petite dimension), rayon des coins, alignement, échelle de la capture, légende facultative sous le cadre |
| Ombre | Aucune, douce, portée, flottante ; intensité ; couleur |
| Format | Automatique (capture + marges), ou taille imposée : Open Graph 1200 × 630, X 1600 × 900, LinkedIn 1200 × 627, Instagram 1080 × 1350, Dribbble 1600 × 1200, diapositive 1920 × 1080 ; échelle ×1 ou ×2 ; PNG, WebP ou JPEG |

« Couleurs de la capture » extrait les couleurs dominantes (fonction serveur
`getPalette`) et propose trois dégradés harmonisés. C’est ce qui donne un
résultat réussi sans réfléchir aux couleurs.

### 3.3 Menus contextuels

- **Sur le canevas** : Copier l’image, Exporter, Envoyer dans la galerie,
  Enregistrer comme préréglage, Réinitialiser.
- **Sur une vignette de préréglage** : Appliquer, Appliquer à toutes les
  captures, Dupliquer, Renommer, Supprimer (préréglages personnels
  seulement).
- **Sur une capture du lot** : Retirer du lot, Ouvrir dans la galerie.

### 3.4 Pages secondaires

- **Préréglages** : grille des préréglages rendus sur une capture d’exemple
  choisie par l’utilisateur, réordonnables par glisser-déposer
  (`Reorder` de `framer-motion`).
- **Historique** : mosaïque justifiée des exports, avec menu contextuel
  (Rouvrir dans l’atelier, Envoyer dans la galerie, Télécharger, Supprimer).

## 4. Modèle de données

```ts
type MediaRef = string; // "upload:…" ou "module:…", voir le socle

interface MockupScene {
  version: 1;
  source: MediaRef;
  /** Recadrage de la capture avant mise en page, en pixels source. */
  crop?: { x: number; y: number; width: number; height: number };
  frame: MockupFrame;
  background: MockupBackground;
  layout: {
    paddingPct: number;      // 0 à 30
    radius: number;          // px à l'échelle ×1
    scale: number;           // 0,5 à 1
    align: "center" | "top" | "bottom";
    caption?: { text: string; color: string; size: number };
  };
  shadow: { kind: "none" | "soft" | "drop" | "float"; strength: number; color: string };
  output: {
    size: "auto" | { width: number; height: number };
    scale: 1 | 2;
    format: "png" | "webp" | "jpeg";
  };
}

type MockupFrame =
  | { kind: "none" }
  | { kind: "window"; theme: "light" | "dark"; title?: string }
  | {
      kind: "browser";
      style: "macos" | "windows" | "minimal";
      theme: "light" | "dark";
      url?: string;
    }
  | { kind: "phone" | "tablet" | "laptop"; variant: string; color: string };

type MockupBackground =
  | { kind: "transparent" }
  | { kind: "solid"; color: string }
  | { kind: "linear" | "radial"; angle: number; stops: { color: string; at: number }[] }
  | { kind: "mesh"; seed: number; colors: string[] }
  | { kind: "image"; ref: MediaRef; blur: number; dim: number };

interface MockupPreset {
  id: string;
  name: string;
  /** Tout sauf la source : un préréglage s'applique à n'importe quelle capture. */
  scene: Omit<MockupScene, "source" | "crop">;
  builtIn: boolean;
  order: number;
}

interface MockupExport {
  id: string;
  scene: MockupScene;
  file: string;              // data/renders/<id>.<ext>
  width: number;
  height: number;
  createdAt: number;
  savedToGallery?: string;   // nom dans les uploads
}
```

**Fichiers** (`modules/mockups/data/`, monté en volume) :

```
presets.json      préréglages personnels (les intégrés sont dans le code)
exports.json      historique, magasin JSON atomique du kit
renders/          images exportées
```

## 5. Rendu

Le rendu repose entièrement sur `renderSceneSvg` du socle :

1. La capture est redimensionnée côté serveur à la taille utile (jamais plus
   de 2 × la taille de sortie) et incluse en URI `data:`.
2. Le cadre est dessiné en SVG : barre de titre, pastilles de fenêtre, barre
   d’adresse, coques d’appareils **génériques**. Aucune image d’appareil de
   marque : les formes sont dessinées, ce qui évite toute question de droits
   et se colore librement.
3. L’ombre utilise `feGaussianBlur` et `feOffset`, rendus identiquement par
   le navigateur et par librsvg.
4. Le fond « maillage » est une composition de dégradés radiaux déterministe à
   partir de sa graine : le même préréglage donne le même fond partout.
5. Côté serveur, `sharp` rastérise le SVG à la densité voulue, puis encode en
   PNG, WebP (qualité 90) ou JPEG (qualité 88, fond aplati).

**Limite connue : la perspective.** Le SVG ne sait pas faire de perspective
3D, et librsvg non plus. Une inclinaison 3D (effet « posé sur une table »)
n’est donc pas prévue en v1. En v2, deux pistes : export par le navigateur
(transformation CSS 3D rendue dans un `<canvas>` puis envoyée au serveur), ou
déformation par quatre points avec `sharp` après rendu à plat.

## 6. Fonctions serveur

Exportées par `index.process.ts`, toutes appelées via le client du kit.

| Fonction | Rôle |
| --- | --- |
| `listPresets()` | Préréglages intégrés et personnels, triés |
| `savePreset(preset)` / `deletePreset(id)` / `reorderPresets(ids)` | Gestion des préréglages personnels |
| `getPalette(ref)` | 5 couleurs dominantes (histogramme sur une réduction à 64 px) et 3 dégradés proposés |
| `renderMockup(scene)` | Rendu unitaire, synchrone (moins d’une seconde), enregistre l’export et renvoie `MockupExport` |
| `enqueueBatch(sources, sceneTemplate)` | Rendu d’un lot par la file du kit (concurrence 2, ressource `image-render`) |
| `sendToGallery(exportId)` | Copie dans les uploads avec un nom aléatoire, puis `announceNewUpload` |
| `listExports()` / `deleteExport(id)` | Historique |

Le module implémente aussi le crochet `processImage(buffer, settings)` du
système de modules, avec le préréglage par défaut. Il apparaît ainsi dans la
section « Traitements » du menu contextuel de la galerie et s’applique en un
clic à toute une sélection. Pour que le libellé soit lisible, `module.json`
gagne un champ facultatif `processLabel` (« Appliquer le mockup par défaut »)
utilisé par la section « Modules » à la place du nom technique.

## 7. Intégration

```json
{
  "name": "mockups",
  "category": "Présentation",
  "supportedFileTypes": ["png", "jpg", "jpeg", "webp"],
  "hasUI": false,
  "processLabel": "Appliquer le mockup par défaut",
  "pages": [
    { "path": "", "title": "Atelier", "component": "pages/studio.tsx" },
    { "path": "presets", "title": "Préréglages", "component": "pages/presets.tsx" },
    { "path": "history", "title": "Historique", "component": "pages/history.tsx" }
  ],
  "navItems": [{ "title": "Mockups", "icon": "Frame" }],
  "fileActions": [
    {
      "id": "open",
      "label": "Créer un mockup",
      "description": "Pose la capture dans un cadre sur un fond soigné",
      "icon": "Frame",
      "fileTypes": ["png", "jpg", "jpeg", "webp"],
      "maxFiles": 30,
      "page": ""
    }
  ]
}
```

L’icône `Frame` est à ajouter à la table d’icônes de
`lib/modules/file-actions.ts`.

## 8. Performances

- Rendu unitaire 2 × 1600 × 900 : de 100 à 300 ms avec `sharp`, 50 à 120 Mo de
  mémoire. Aucun besoin de la file pour un rendu unitaire.
- Lot : file du kit, deux rendus en parallèle au plus.
- Vignettes de la bande des préréglages : rendues **dans le navigateur** (SVG
  inline à petite échelle, image source réduite une seule fois), jamais par le
  serveur. Faire défiler vingt préréglages ne génère aucune requête.

## 9. Sécurité

- Tout texte saisi (barre d’adresse, titre, légende) est échappé pour XML
  avant d’entrer dans le SVG. Un test vérifie qu’une adresse comme
  `"><script>` ressort échappée.
- Les sources sont résolues par `resolveMediaRef` : pas de chemin libre, pas
  d’URL distante (une image distante passe d’abord par l’import du kit).
- Les métadonnées EXIF de la capture ne sont jamais recopiées dans l’export.

## 10. Découpage

| Étape | Contenu | Critères d’acceptation |
| --- | --- | --- |
| M1 | Atelier avec une capture : fonds uni et dégradé, cadres aucun et navigateur, marges, coins, ombre douce, export PNG, envoi à la galerie | Depuis la galerie, un mockup exporté apparaît dans la galerie en moins de 5 s, identique à l’aperçu |
| M2 | Tous les cadres, maillage, image floutée, couleurs de la capture, formats imposés, préréglages personnels | Un préréglage enregistré s’applique à une autre capture sans retouche |
| M3 | Lot, historique, `processImage` avec préréglage par défaut, entrée depuis AI Image Gen | 30 captures traitées en une action, visibles dans la galerie à mesure |
| M4 | Perspective (v2), légendes riches, logo en filigrane | À définir après M3 |

## 11. Tests

- Unitaires : `renderSceneSvg` (instantanés SVG de chaque cadre et fond),
  échappement XML, calcul des tailles de sortie, palette sur des images de
  test.
- Rendu : comparaison au pixel près entre deux rendus serveur successifs
  (déterminisme), et écart borné entre le rendu serveur et une capture du
  rendu navigateur.
- Navigateur : parcours galerie → atelier → export → galerie.

## 12. Questions ouvertes

- Faut-il un « mode sombre automatique » qui choisit le thème du cadre selon
  la luminance moyenne de la capture ? Simple à faire, à valider à l’usage.
- Les préréglages doivent-ils être partageables entre instances (export et
  import JSON) ? Utile si d’autres personnes installent ShareX Manager.
