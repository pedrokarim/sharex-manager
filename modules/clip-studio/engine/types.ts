/**
 * Modèle d'un projet Clip Studio.
 *
 * Tout est exprimé en images (frames) à la cadence du projet, et les
 * positions sont relatives au canevas (0 à 1) : un projet se redimensionne
 * sans recalcul, et l'aperçu comme l'export lisent exactement les mêmes
 * nombres.
 */

import type { MotionParamValues } from "./motion/types";
import type { ExportCover, ExportPost } from "../lib/post-types";

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
  /** Image de marque appliquée (module `brand-kit`) ; absente pour un projet libre. */
  brandKitId?: string;
  /** Demande et script quand le clip vient de l'assistant, pour rédiger ses textes de publication. */
  brief?: {
    prompt: string;
    title?: string;
    script?: string[];
    /** Sources de la vérification des faits ; `segment` est l'index de la ligne dans `script`. */
    sources?: { segment: number; url: string; title: string }[];
    /** Date de la vérification des faits (ms), absente si elle n'a pas eu lieu. */
    checkedAt?: number;
  };
  /**
   * Pistes de haut en bas, comme dans la timeline : la première piste
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
  /** Piste ajoutée par une image de marque (filigrane, carton de fin), retirée avec elle. */
  origin?: "brand";
  items: ClipItem[];
  /** Effets de plan (impact) posés sur toute la piste, à un instant donné. */
  effects?: ShotEffect[];
}

/**
 * Effet de plan : secousse du cadre, flash, zoom de frappe, aberration de
 * couleur, joué sur toute la piste de l'image `at` pendant `frames` images.
 */
export interface ShotEffect {
  /** Identifiant d'un effet de `motion/scenes.ts` (« impact-hit », « impact-flash »…). */
  kind: string;
  at: number;
  frames: number;
}

export interface MediaSource {
  /** Adresse de lecture, de même origine que l'application. */
  url: string;
  /** Référence stable : « upload:… » ou « module:… ». */
  ref: string;
  name: string;
  kind: "image" | "video" | "audio";
  width?: number;
  height?: number;
  durationMs?: number;
  /** Mention d'auteur et de licence, à reprendre à la publication. */
  credit?: string;
  /**
   * Droits d'une image trouvée : `free` (licence libre vérifiée, Openverse),
   * `unverified` (trouvée sur le web, à vérifier avant de publier). Absent :
   * un média de l'utilisateur ou généré.
   */
  rights?: "free" | "unverified";
  /** Voix de synthèse : instants de chaque mot, pour les sous-titres. */
  words?: TimedWord[];
  /** Voix de synthèse : texte lu et réglages, pour la relire avec une autre voix. */
  speech?: SpeechInfo;
}

/** Texte d'une voix de synthèse et réglages qui l'ont produite. */
export interface SpeechInfo {
  text: string;
  voice: string;
  speed?: number;
  /** Intonation d'une voix locale (Piper) : « steady », « balanced » ou « expressive ». */
  tone?: string;
}

/** Position et taille relatives au canevas ; x et y désignent le centre. */
export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

/** Les neuf animations d'origine, et « none ». */
export type LegacyAnimKind =
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

/**
 * Identifiant d'un préréglage du registre (`engine/motion/registry.ts`).
 * Les noms d'origine restent proposés à la saisie ; tout autre identifiant
 * est accepté, et un identifiant inconnu vaut « none » au rendu.
 */
export type AnimKind = LegacyAnimKind | (string & {});

export interface Anim {
  kind: AnimKind;
  frames: number;
  /** Réglages exposés du préréglage (intensité, direction…), par identifiant. */
  params?: MotionParamValues;
}

/**
 * Mise en avant : une animation jouée pendant que l'élément est à l'écran,
 * entre la fin de son entrée et le début de sa sortie.
 */
export interface AnimEmphasis extends Anim {
  /** Première image jouée, comptée depuis le début de l'élément. */
  at: number;
  /** Nombre de passages (1 par défaut) ; 0 : en boucle jusqu'à la sortie. */
  repeat?: number;
}

/** Les sept mouvements de caméra d'origine, et « none ». */
export type LegacyMotion =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down";

/**
 * Mouvement de caméra sur une image : un identifiant de `motion/scenes.ts`
 * (Ken Burns, secousse, caméra à l'épaule…). Un identifiant inconnu vaut
 * « none » au rendu.
 */
export type Motion = LegacyMotion | (string & {});

/**
 * Passage d'un plan au suivant sur une même piste. La transition appartient
 * au plan qui arrive : pendant ses premières images, le plan précédent reste
 * affiché, figé sur sa dernière image. Aucune durée ne change.
 */
export type LegacyTransitionKind = "fade" | "fade-black" | "slide" | "wipe" | "zoom";

/**
 * Identifiant d'une transition de `motion/scenes.ts` ; les cinq d'origine
 * restent proposées à la saisie. Une transition inconnue est jouée comme un
 * fondu enchaîné.
 */
export type TransitionKind = LegacyTransitionKind | (string & {});

export interface Transition {
  kind: TransitionKind;
  frames: number;
}

/** Rôles de texte que posent les modèles, et dont une image de marque fixe le style. */
export type TextRole = "title" | "subtitle" | "caption" | "label" | "body";

/**
 * Indication posée par un modèle : d'où l'élément tire son style ou sa
 * couleur. C'est elle qui permet d'appliquer une image de marque après coup :
 * on sait quel texte est un titre et quel cadre porte la teinte du segment.
 */
export interface ThemeHint {
  /** Texte : rôle dont il prend le style. */
  role?: TextRole;
  /**
   * Couleur : teinte du segment, aplat d'un plan sans image, voile sur une
   * image (une marque le retire : l'image reste éclatante), ombre portée
   * d'une carte, carte, mise en avant, ou vert d'une bonne réponse (qui ne
   * suit pas la marque).
   */
  paint?: "accent" | "plate" | "veil" | "shadow" | "surface" | "highlight" | "success";
  /** Rang du segment, pour la teinte tournante. */
  accent?: number;
}

/**
 * Indication de montage posée par un modèle sur le fond d'un segment : son
 * rang, l'émotion que la mascotte d'une marque y montre, et le temps fort
 * qu'il porte. Absente : un élément ordinaire, posé à la main.
 */
export interface SegmentCue {
  /** Rang du segment dans le modèle : 0 l'ouverture, puis chaque segment, puis la conclusion. */
  index: number;
  /** Émotion du segment (liste fermée de `poses.ts`) ; absente : neutre. */
  emotion?: string;
  /** Geste souhaité de la mascotte (liste fermée de `poses.ts`). */
  gesture?: string;
  /** Temps fort du segment : accroche, révélation (numéro 1, bonne réponse), fin. */
  beat?: "hook" | "reveal" | "end";
  /** Instant du temps fort, en images depuis le début du segment (révélation d'un quiz) ; absent : son début. */
  beatOffset?: number;
}

interface ItemBase {
  id: string;
  /** Première image où l'élément est visible. */
  start: number;
  /** Nombre d'images. */
  duration: number;
  label?: string;
  /** Élément ajouté par une image de marque, retiré ou remplacé avec elle. */
  origin?: "brand";
  theme?: ThemeHint;
  /** Fond d'un segment de modèle (ou plan suivant d'un même segment) : voir `SegmentCue`. */
  cue?: SegmentCue;
}

interface VisualBase extends ItemBase {
  transform: Transform;
  animIn: Anim;
  animOut: Anim;
  animEmphasis?: AnimEmphasis;
  /** Transition depuis le plan qui précède, sur la même piste. */
  transition?: Transition;
}

export interface ImageItem extends VisualBase {
  type: "image";
  source: MediaSource;
  fit: "cover" | "contain";
  motion: Motion;
  radius: number;
  /** Image retournée en miroir (pose de la mascotte tournée vers le contenu). */
  flipX?: boolean;
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
   * Vitesse de lecture (1 par défaut) : à 2, une seconde de timeline lit deux
   * secondes de source. `trimStart` reste compté en images de la source.
   */
  speed?: number;
  /** Mouvement de caméra sur la vidéo (secousse, zoom de frappe…) ; aucun par défaut. */
  motion?: Motion;
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
 * Sous-titres animés : le texte suit une voix mot à mot. On montre un groupe
 * de quelques mots à la fois et le mot prononcé ressort.
 */
export interface Karaoke {
  words: TimedWord[];
  /** Décalage dans la voix, en images : avance quand on rogne le début ou qu'on scinde. */
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
  /**
   * « shrink » : la police rétrécit jusqu'à ce que le texte tienne dans son
   * cadre, en largeur comme en hauteur. Sert aux textes que l'on ne maîtrise
   * pas (nom de marque, accroche) : un nom long ne déborde plus du carton.
   */
  fit?: "shrink";
}

export interface ShapeItem extends VisualBase {
  type: "shape";
  shape: "rect" | "ellipse" | "progress";
  fill: string;
  radius: number;
  /** Barre de progression : couleur du fond et sens du remplissage. */
  progress?: { track: string; reverse: boolean };
  /** Trame d’imprimerie posée sur l’aplat (rectangle seulement) ; absente : l’aplat reste uni. */
  pattern?: ShapePattern;
}

/**
 * Trame en points sur un aplat, à la façon d’une impression Riso : des
 * points d’une encre de la marque, à faible opacité, en quinconce.
 */
export interface ShapePattern {
  kind: "dots";
  color: string;
  /** Opacité des points, de 0 à 1. */
  opacity: number;
  /** Pas de la trame, relatif au petit côté de l’aplat. */
  spacing: number;
}

export interface AudioItem extends ItemBase {
  type: "audio";
  source: MediaSource;
  trimStart: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /**
   * Musique qui s'efface sous la voix : gain appliqué (0 à 1) pendant qu'une
   * voix off parle (`engine/mix.ts`). Absent : le volume ne bouge pas.
   */
  duck?: number;
}

export type VisualItem = ImageItem | VideoItem | TextItem | ShapeItem;
export type ClipItem = VisualItem | AudioItem;

export function isVisual(item: ClipItem): item is VisualItem {
  return item.type !== "audio";
}

/** Élément qui porte du son : pistes audio et vidéos. */
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
  /** Textes de publication (dossier 01 ter, § 4). */
  post?: ExportPost;
  cover?: ExportCover;
  /** Volume mesuré du fichier rendu. */
  loudness?: { lufs: number; peakDb: number };
  /** Crédits relevés dans le projet au moment du rendu. */
  credits?: string[];
  /** Sous-titres rendus à côté de la vidéo (`.srt`). */
  subtitles?: { file: string; language: string };
  /** Marque du projet au moment du rendu. */
  brandKitId?: string;
  /** `updatedAt` du projet rendu : le projet a changé depuis quand il est plus récent. */
  projectUpdatedAt?: number;
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
  /** Voix de synthèse : instants de chaque mot, pour les sous-titres. */
  words?: TimedWord[];
  /** Voix de synthèse : texte lu et réglages. */
  speech?: SpeechInfo;
  createdAt: number;
}
