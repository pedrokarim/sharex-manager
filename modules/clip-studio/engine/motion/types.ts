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
  | "color";

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
  /** Unité de `x`, `y` et `blur`. */
  unit: MotionUnit;
}
