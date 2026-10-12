/**
 * Modèle des animations de Clip Studio : des pistes d'images clés.
 *
 * Une animation n'est pas du code mais une donnée, lue par un seul
 * interpréteur (`interpret.ts`). Ajouter un préréglage, c'est ajouter un
 * objet : aucune branche de rendu à écrire, et l'aperçu comme l'export le
 * lisent de la même façon.
 */

// ─── Courbes ─────────────────────────────────────────────────────

export type EaseFamily =
  | "sine"
  | "quad"
  | "cubic"
  | "quart"
  | "quint"
  | "expo"
  | "circ"
  | "back"
  | "elastic"
  | "bounce";

export type EaseMode = "in" | "out" | "inOut";

/** Courbe nommée de la bibliothèque : « linear », « outCubic », « inOutBack »… */
export type EaseName = "linear" | `${EaseMode}${Capitalize<EaseFamily>}`;

/**
 * Une courbe : un nom de la bibliothèque, une Bézier, un ressort, des marches,
 * ou une famille réglée (puissance d'exposant libre, recul, élastique).
 *
 * Les trois dernières formes précisent le modèle du dossier : les notations
 * paramétrées (« back.out(1.7) », « inOut(3) ») sont fréquentes, et les
 * ramener à la courbe nommée la plus proche changerait l'animation.
 */
export type EaseSpec =
  | EaseName
  | { bezier: [number, number, number, number] }
  | { spring: { mass: number; stiffness: number; damping: number; velocity?: number } }
  | { steps: number; jump?: "start" | "end" }
  | { power: number; mode: EaseMode }
  | { back: number; mode: EaseMode }
  | { elastic: { amplitude?: number; period?: number }; mode: EaseMode };

// ─── Pistes ──────────────────────────────────────────────────────

/**
 * Propriétés animables d'un élément, ou d'une unité de texte.
 *
 * Longueurs : `x`, `y` et `blur` s'expriment dans l'unité du préréglage
 * (`MotionPreset.units`) : fraction du petit côté du cadre, ou taille du
 * texte (« em »). `dx` et `dy` sont une précision du modèle : des fractions
 * de la largeur et de la hauteur du cadre, l'unité des neuf animations
 * historiques (qu'il faut rendre au pixel près) et la plus simple pour une
 * entrée qui part du bord de l'image.
 */
export type MotionProperty =
  | "opacity"
  | "x"
  | "y"
  | "dx"
  | "dy"
  | "scale"
  | "scaleX"
  | "scaleY"
  /** Degrés, autour du centre de l'élément. */
  | "rotate"
  /** Degrés. */
  | "skewX"
  | "blur"
  /** Multiplicateur : 1 ne change rien, 2 double la luminosité. */
  | "brightness"
  /** Part visible, de 0 à 1 (frappe, masque). */
  | "reveal"
  /** Balayage de gauche à droite, de 0 (rien) à 1 (tout). */
  | "wipe"
  /** Découpe rectangulaire, voir `ClipInsets`. */
  | "clip"
  /** Espacement ajouté entre les lettres, en « em ». */
  | "tracking"
  /** Couleur du texte ou du remplissage, interpolée en OKLab. */
  | "color"
  /**
   * Part montrée par le masque de forme du préréglage (`MotionPreset.mask`),
   * de 0 (rien) à 1 (tout) : cercle qui s'ouvre, biais, taches, stores.
   */
  | "mask";

/**
 * Découpe : part retirée de chaque bord de l'élément, dans l'ordre haut,
 * droite, bas, gauche (de 0 à 1). `[0, 0, 0, 0]` montre tout.
 */
export type ClipInsets = [top: number, right: number, bottom: number, left: number];

/**
 * Valeur d'une image clé : un nombre, une couleur (`#rrggbb`, `rgb()`, ou
 * `currentColor` pour la couleur propre de l'élément), ou une découpe.
 */
export type KeyframeValue = number | string | ClipInsets;

export interface Keyframe {
  /** Position dans l'animation, de 0 à 1. */
  at: number;
  value: KeyframeValue;
  /** Courbe qui mène à cette image clé (sinon celle du préréglage). */
  ease?: EaseSpec;
}

export type MotionTracks = Partial<Record<MotionProperty, Keyframe[]>>;

// ─── Préréglages ─────────────────────────────────────────────────

export type MotionPhase = "in" | "out" | "emphasis" | "loop";
export type MotionTarget = "any" | "text" | "image" | "shape";
export type MotionSplit = "whole" | "line" | "word" | "char";
export type MotionUnit = "frame" | "em";

/** Nos catégories, celles du sélecteur de l'inspecteur. */
export type MotionCategory =
  | "fade"
  | "slide"
  | "scale"
  | "rotate"
  | "mask"
  | "blur-light"
  | "by-letter"
  | "by-word"
  | "typing"
  | "glitch"
  | "impact"
  | "counter"
  | "title"
  | "attention"
  | "loop";

export const MOTION_CATEGORY_LABELS: Record<MotionCategory, string> = {
  fade: "Fondus",
  slide: "Glissements",
  scale: "Échelles et rebonds",
  rotate: "Rotations",
  mask: "Masques et balayages",
  "blur-light": "Flous et lumières",
  "by-letter": "Lettre par lettre",
  "by-word": "Mot par mot",
  typing: "Frappe et décodage",
  glitch: "Glitch",
  impact: "Impacts",
  counter: "Compteurs",
  title: "Titres et bandeaux",
  attention: "Mise en avant",
  loop: "Boucles",
};

export interface MotionStagger {
  /** Décalage entre deux unités consécutives. */
  eachMs: number;
  /** Ordre de départ : du début, de la fin, du centre vers les bords, ou au hasard (reproductible). */
  from: "start" | "end" | "center" | "random";
  /** Répartition des départs : linéaire par défaut. */
  ease?: EaseSpec;
}

/**
 * Effet qui ne s'interpole pas : brouillage, curseur, compteur, secousse…
 * Le type reste ouvert : chaque effet (étape A4) lit ses propres options.
 */
export interface MotionEffect {
  type: string;
  /** Fenêtre d'action, en part de l'animation (0 et 1 par défaut). */
  from?: number;
  to?: number;
  options?: Record<string, number | string | boolean>;
}

export type MotionDirection = "up" | "down" | "left" | "right";

// ─── Masques de forme ────────────────────────────────────────────

/**
 * Forme du masque qui révèle l'élément, pilotée par la piste `mask` :
 *
 * - `circle` : un cercle qui s'ouvre depuis `center` jusqu'au coin le plus loin ;
 * - `diamond` : la même chose en losange ;
 * - `diagonal` : un bord droit qui traverse la boîte, incliné de `angle` ;
 * - `blob` : quelques taches qui s'étendent et se rejoignent, comme de l'encre ;
 * - `blinds` : des lames horizontales qui s'ouvrent l'une après l'autre ;
 * - `bars` : des bandes verticales qui s'ouvrent depuis leur milieu ;
 * - `clock` : un secteur qui tourne comme une aiguille ;
 * - `tiles` : des carreaux qui apparaissent dans un ordre mélangé.
 */
export type MotionMaskShape = "circle" | "diamond" | "diagonal" | "blob" | "blinds" | "bars" | "clock" | "tiles";

export interface MotionMask {
  shape: MotionMaskShape;
  /** Centre du cercle, du losange ou de l'horloge, en part de la boîte (0,5 ; 0,5 au milieu). */
  center?: [number, number];
  /** Inclinaison du biais, en degrés : 0 balaie de gauche à droite, 90 de haut en bas. */
  angle?: number;
  /** Nombre de lames, de bandes, de taches ou de carreaux par côté. */
  count?: number;
}

// ─── Calques secondaires ─────────────────────────────────────────

/**
 * Calque dessiné avec l'élément, derrière ou devant lui :
 *
 * - `copy` : une copie de la silhouette, teinte (`color`), floutée ou décalée
 *   par ses pistes ; c'est la lueur, l'aberration chromatique, l'ombre portée ;
 * - `echo` : des copies de l'élément lui-même, en retard sur son animation
 *   (traîne, suiveurs), qui le rejoignent à la fin ;
 * - `ring` : le contour de la boîte, qui s'élargit (halo, onde, anneau) ;
 * - `shine` : un reflet, bande de lumière qui traverse la silhouette ;
 * - `veil` : un voile de couleur posé sur la silhouette (éclair, teinte) ;
 * - `shadow` : une ombre au sol, sous l'élément ;
 * - `plate` : un fond (bandeau, étiquette) ; sur un texte qui a un fond, c'est
 *   ce fond même qui prend la piste du calque ;
 * - `highlight`, `underline`, `strike` : surligneur, soulignement et trait
 *   barré qui se tracent ligne après ligne (piste `wipe`).
 */
export type MotionLayerKind =
  | "copy"
  | "echo"
  | "ring"
  | "shine"
  | "veil"
  | "shadow"
  | "plate"
  | "highlight"
  | "underline"
  | "strike";

export interface MotionLayer {
  kind: MotionLayerKind;
  /**
   * Devant ou derrière l'élément. Par défaut, le reflet, le voile, le
   * soulignement et le trait barré sont devant, le reste derrière.
   */
  place?: "behind" | "front";
  /**
   * Le calque suit l'état animé de l'élément (position, rotation, échelle) ;
   * `false` le laisse à la place de repos de l'élément (une ombre au sol ne
   * monte pas avec lui).
   */
  follow?: boolean;
  /**
   * Le calque reste, à son état final, une fois la phase finie : un bandeau
   * posé par une entrée reste sous le titre jusqu'à sa sortie.
   */
  persist?: boolean;
  /**
   * Pistes du calque. `x` et `y` y sont des parts de la boîte de l'élément,
   * `scale` agrandit le calque autour de son ancrage, `opacity` multiplie
   * celle de l'élément (sauf pour l'anneau et l'ombre, qui ont la leur).
   */
  tracks: MotionTracks;
  /** Couleur du calque ; `currentColor` : celle de l'élément. */
  color?: string;
  /** Ancrage des échelles du calque, en part de sa boîte (0,5 ; 0,5 : le centre). */
  origin?: [number, number];
  /** Réglages propres à chaque sorte de calque (épaisseur, nombre de copies…). */
  options?: Record<string, number | string | boolean>;
}

// ─── Grilles ─────────────────────────────────────────────────────

/**
 * Ordre de départ des carreaux d'une grille : lignes (de haut en bas, un
 * peu décalées d'une colonne à l'autre), colonnes, diagonale, du centre vers
 * les bords, en spirale depuis le centre, ou au hasard (reproductible).
 */
export type MotionGridOrder = "rows" | "columns" | "diagonal" | "center" | "spiral" | "random";

/**
 * Élément découpé en carreaux, chacun animé avec un décalage : une image qui
 * se reconstitue, une liste dont les rangées montent tour à tour. Chaque
 * carreau suit les pistes du préréglage autour de son propre centre ; le
 * décalage entre deux carreaux est `stagger.eachMs`.
 */
export interface MotionGrid {
  columns: number;
  rows: number;
  order: MotionGridOrder;
  /**
   * Une rangée (ou une colonne) sur deux part du côté opposé : les
   * déplacements horizontaux (`rows`) ou verticaux (`columns`) des carreaux
   * impairs sont inversés.
   */
  alternate?: "rows" | "columns";
}

/**
 * Réglage exposé dans l'inspecteur.
 *
 * - `amount` (l'intensité) multiplie l'écart au repos des pistes citées :
 *   à 0, l'animation ne bouge plus ; à 2, elle va deux fois plus loin.
 * - `direction` fait tourner les déplacements (`x`, `y`, `dx`, `dy`) : le
 *   préréglage est écrit pour sa direction par défaut, et l'on obtient les
 *   trois autres sans les déclarer.
 */
export type MotionParam =
  | {
      id: string;
      kind: "amount";
      label: string;
      min: number;
      max: number;
      default: number;
      affects: MotionProperty[];
    }
  | {
      id: string;
      kind: "direction";
      label: string;
      default: MotionDirection;
      options?: MotionDirection[];
    };

/** Valeurs choisies des réglages, par identifiant de réglage. */
export type MotionParamValues = Record<string, number | string>;

export interface MotionPreset {
  /** Identifiant stable, enregistré dans les projets : « rise-short », « drop-bounce »… */
  id: string;
  /** Nom affiché : « Montée courte ». */
  label: string;
  category: MotionCategory;
  phase: MotionPhase;
  target: MotionTarget;
  /** Durée par défaut d'une unité, modifiable dans l'inspecteur. */
  durationMs: number;
  /** Courbe des segments qui n'en précisent pas (linéaire sinon). */
  ease?: EaseSpec;
  /**
   * Unité de `x`, `y` et `blur`. Par défaut, « em » pour un texte découpé
   * (ligne, mot, lettre), et le petit côté du cadre sinon.
   */
  units?: MotionUnit;
  /** Texte : unité animée, et décalage entre unités. */
  split?: MotionSplit;
  stagger?: MotionStagger;
  /**
   * Pistes. Une piste sans image clé à 0 (ou à 1) part de (ou revient à) la
   * valeur de repos de la propriété, comme les images clés implicites de CSS.
   */
  tracks: MotionTracks;
  /** Effets qui ne s'interpolent pas : brouillage, curseur, compteur, secousse. */
  effects?: MotionEffect[];
  /** Réglages exposés : intensité, direction. */
  params?: MotionParam[];
  /**
   * Point d'ancrage des rotations, échelles et inclinaisons, en part de la
   * boîte de l'élément (ou de l'unité de texte) : `[0, 1]` est le coin bas
   * gauche. Absent : le centre.
   */
  origin?: [number, number];
  /** Masque de forme, piloté par la piste `mask`. */
  mask?: MotionMask;
  /** Calques secondaires : halo, anneau, reflet, voile, traîne, copies, fond. */
  layers?: MotionLayer[];
  /** Élément découpé en carreaux (image, forme, texte en bloc). */
  grid?: MotionGrid;
  /**
   * Joué à rebours. Le registre s'en sert pour servir une entrée comme
   * sortie (et l'inverse) quand aucune variante n'est déclarée : le dernier
   * élément entré sort le premier.
   */
  reversed?: boolean;
}

// ─── État calculé ────────────────────────────────────────────────

/**
 * État d'un élément (ou d'une unité de texte) à une image donnée. Les valeurs
 * de repos sont celles de `REST_STATE` : un état au repos ne change rien au
 * dessin.
 */
export interface MotionState {
  opacity: number;
  /** Décalage en fraction de la largeur et de la hauteur du cadre. */
  dx: number;
  dy: number;
  /** Décalage dans l'unité `unit`. */
  x: number;
  y: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  /** Degrés. */
  rotate: number;
  /** Degrés. */
  skewX: number;
  /** Rayon de flou, dans l'unité `unit`. */
  blur: number;
  brightness: number;
  /** Part révélée (texte « machine à écrire »). */
  reveal: number;
  /** Balayage : révèle de gauche à droite. */
  wipe: number;
  clip: ClipInsets;
  /** Espacement ajouté entre les lettres, en « em ». */
  tracking: number;
  /** Couleur imposée au texte ou au remplissage ; absente : celle de l'élément. */
  color?: string;
  /** Part montrée par le masque de forme (`maskShape`). */
  mask: number;
  /** Masque de forme du préréglage, s'il en a un. */
  maskShape?: MotionMask;
  /** Ancrage des transformations, en part de la boîte ; absent : le centre. */
  origin?: [number, number];
  /** Unité de `x`, `y` et `blur`. */
  unit: MotionUnit;
}
