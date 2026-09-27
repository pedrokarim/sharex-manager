/**
 * Modèle d'un projet Clip Studio.
 *
 * Tout est exprimé en images (frames) à la cadence du projet, et les
 * positions sont relatives au canevas (0 à 1) : un projet se redimensionne
 * sans recalcul, et l'aperçu comme l'export lisent exactement les mêmes
 * nombres.
 */

export type AspectPreset = "9:16" | "16:9" | "1:1" | "4:5";

export const ASPECTS: Record<AspectPreset, { width: number; height: number; label: string }> = {
  "9:16": { width: 1080, height: 1920, label: "Short vertical" },
  "16:9": { width: 1920, height: 1080, label: "Paysage" },
  "1:1": { width: 1080, height: 1080, label: "Carré" },
  "4:5": { width: 1080, height: 1350, label: "Portrait" },
};

export interface ClipProject {
  version: 1;
  id: string;
  name: string;
  aspect: AspectPreset;
  width: number;
  height: number;
  fps: number;
  background: string;
  /**
   * Pistes de haut en bas, comme dans la timeline : la première piste
   * visuelle est dessinée par-dessus les suivantes.
   */
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export interface Track {
  id: string;
  kind: "visual" | "audio";
  name: string;
  hidden?: boolean;
  muted?: boolean;
  locked?: boolean;
  items: ClipItem[];
}

export interface MediaSource {
  /** Adresse de lecture, de même origine que l'application. */
  url: string;
  /** Référence stable : « upload:… » ou « module:… ». */
  ref: string;
  name: string;
  kind: "image" | "video" | "audio";
  width?: number;
  height?: number;
  durationMs?: number;
  /** Mention d'auteur et de licence, à reprendre à la publication. */
  credit?: string;
  /** Voix de synthèse : instants de chaque mot, pour les sous-titres. */
  words?: TimedWord[];
}

/** Position et taille relatives au canevas ; x et y désignent le centre. */
export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export type AnimKind =
  | "none"
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "pop"
  | "zoom"
  | "typewriter"
  | "wipe";

export interface Anim {
  kind: AnimKind;
  frames: number;
}

/** Mouvement de caméra lent sur une image (effet Ken Burns). */
export type Motion =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down";

/**
 * Passage d'un plan au suivant sur une même piste. La transition appartient
 * au plan qui arrive : pendant ses premières images, le plan précédent reste
 * affiché, figé sur sa dernière image. Aucune durée ne change.
 */
export type TransitionKind = "fade" | "fade-black" | "slide" | "wipe" | "zoom";

export interface Transition {
  kind: TransitionKind;
  frames: number;
}

interface ItemBase {
  id: string;
  /** Première image où l'élément est visible. */
  start: number;
  /** Nombre d'images. */
  duration: number;
  label?: string;
}

interface VisualBase extends ItemBase {
  transform: Transform;
  animIn: Anim;
  animOut: Anim;
  /** Transition depuis le plan qui précède, sur la même piste. */
  transition?: Transition;
}

export interface ImageItem extends VisualBase {
  type: "image";
  source: MediaSource;
  fit: "cover" | "contain";
  motion: Motion;
  radius: number;
}

export interface VideoItem extends VisualBase {
  type: "video";
  source: MediaSource;
  fit: "cover" | "contain";
  /** Décalage dans la source, en images du projet. */
  trimStart: number;
  volume: number;
  radius: number;
  /**
   * Vitesse de lecture (1 par défaut) : à 2, une seconde de timeline lit deux
   * secondes de source. `trimStart` reste compté en images de la source.
   */
  speed?: number;
}

export interface TextStyle {
  font: string;
  weight: number;
  /** Taille relative à la hauteur du canevas. */
  size: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  uppercase: boolean;
  letterSpacing: number;
  /** Épaisseur relative à la taille du texte. */
  stroke: { color: string; width: number } | null;
  shadow: { color: string; blur: number; offsetY: number } | null;
  background: { color: string; padding: number; radius: number } | null;
}

/** Un mot prononcé et ses instants, en millisecondes depuis le début de la voix. */
export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Sous-titres animés : le texte suit une voix mot à mot. On montre un groupe
 * de quelques mots à la fois et le mot prononcé ressort.
 */
export interface Karaoke {
  words: TimedWord[];
  /** Décalage dans la voix, en images : avance quand on rogne le début ou qu'on scinde. */
  offset: number;
  /** Couleur du mot prononcé. */
  highlight: string;
  /** Nombre maximal de mots affichés ensemble. */
  groupSize: number;
  /** Élément audio sous-titré, pour ne pas le sous-titrer deux fois. */
  voiceId?: string;
}

export interface TextItem extends VisualBase {
  type: "text";
  text: string;
  style: TextStyle;
  karaoke?: Karaoke;
}

export interface ShapeItem extends VisualBase {
  type: "shape";
  shape: "rect" | "ellipse" | "progress";
  fill: string;
  radius: number;
  /** Barre de progression : couleur du fond et sens du remplissage. */
  progress?: { track: string; reverse: boolean };
}

export interface AudioItem extends ItemBase {
  type: "audio";
  source: MediaSource;
  trimStart: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export type VisualItem = ImageItem | VideoItem | TextItem | ShapeItem;
export type ClipItem = VisualItem | AudioItem;

export function isVisual(item: ClipItem): item is VisualItem {
  return item.type !== "audio";
}

/** Élément qui porte du son : pistes audio et vidéos. */
export function hasAudio(item: ClipItem): item is AudioItem | VideoItem {
  return item.type === "audio" || item.type === "video";
}

export interface ClipExport {
  id: string;
  projectId: string;
  projectName: string;
  file: string;
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  createdAt: number;
  /** Nom du fichier dans la galerie, une fois le clip envoyé. */
  galleryFile?: string;
}

export interface ClipAsset {
  file: string;
  kind: "image" | "video" | "audio";
  originalName: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
  /** Mention d'auteur et de licence (voix de synthèse…). */
  credit?: string;
  /** Voix de synthèse : instants de chaque mot, pour les sous-titres. */
  words?: TimedWord[];
  createdAt: number;
}
