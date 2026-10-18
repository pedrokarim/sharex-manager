/**
 * Vignettes animées du sélecteur : un projet témoin d'un seul élément,
 * dessiné par `drawFrame`, le même moteur que l'aperçu et l'export.
 *
 * Ce fichier ne dessine rien : il construit le projet et dit quelle image
 * montrer à quel instant. Le dessin et l'horloge sont dans
 * `components/motion-thumbnail.tsx` et `motion-ticker.ts`.
 */

import { naturalFrames } from "../engine/motion/interpret";
import { countUnits } from "../engine/motion/text-layout";
import type { MotionParamValues, MotionPreset } from "../engine/motion/types";
import type { ClipProject, ShapeItem, TextItem, VisualItem } from "../engine/types";
import { isSplitPreset, type PickerItemType, type PickerPhase } from "./motion-catalog";

/** Cadence des vignettes : celle des projets par défaut. */
export const PREVIEW_FPS = 30;

/** Mot du témoin des préréglages de texte. */
export const PREVIEW_WORD = "Texte";

/** Images vides avant une entrée, et après une sortie, pour voir l'élément arriver ou partir. */
const LEAD_FRAMES = 6;
/** Images au repos après une entrée (ou avant une sortie). */
const HOLD_FRAMES = 18;
/** Bornes d'une phase de vignette : assez pour la lire, pas assez pour lasser. */
const MIN_PHASE_FRAMES = 8;
const MAX_PHASE_FRAMES = 75;

export interface PreviewOptions {
  /** Taille du canevas, en pixels réels. */
  width: number;
  height: number;
  /** Couleur de l'élément témoin (celle du thème). */
  color: string;
  /** Type de l'élément animé : un texte montre un mot, le reste un rectangle. */
  itemType: PickerItemType;
  /** Réglages du préréglage (intensité, direction…) ; absents : ses défauts. */
  params?: MotionParamValues;
  /** Texte du témoin, à la place de `PREVIEW_WORD` (un nombre pour un compteur, un titre dans la galerie). */
  text?: string;
}

export interface PreviewScene {
  project: ClipProject;
  /** Longueur d'un tour complet, en images : la vignette boucle dessus. */
  loopFrames: number;
  /** Image montrée à l'arrêt : le milieu de l'animation. */
  stillFrame: number;
}

/** Le témoin est-il un mot ? Oui sur un texte, et pour tout préréglage pensé pour le texte. */
export function previewShowsText(preset: MotionPreset, itemType: PickerItemType): boolean {
  return itemType === "text" || preset.target === "text" || isSplitPreset(preset);
}

/** Durée d'une phase dans la vignette, en images. */
export function previewPhaseFrames(preset: MotionPreset, showsText: boolean, text: string = PREVIEW_WORD): number {
  const split = showsText && preset.split ? preset.split : "whole";
  const count = split === "whole" ? 1 : countUnits(text, split);
  const frames = naturalFrames(preset, count, PREVIEW_FPS);
  return Math.min(MAX_PHASE_FRAMES, Math.max(MIN_PHASE_FRAMES, frames));
}

const NONE = { kind: "none", frames: 0 } as const;

function witness(preset: MotionPreset, options: PreviewOptions, showsText: boolean, start: number, duration: number): VisualItem {
  const base = {
    id: `preview-${preset.id}`,
    start,
    duration,
    animIn: { ...NONE },
    animOut: { ...NONE },
  };
  if (showsText) {
    const text: TextItem = {
      ...base,
      type: "text",
      text: options.text || PREVIEW_WORD,
      transform: { x: 0.5, y: 0.5, width: 0.9, height: 0.6, rotation: 0, opacity: 1 },
      style: {
        font: "Inter",
        weight: 800,
        size: 0.3,
        color: options.color,
        align: "center",
        lineHeight: 1.1,
        uppercase: false,
        letterSpacing: 0,
        stroke: null,
        shadow: null,
        background: null,
      },
    };
    return text;
  }
  const shape: ShapeItem = {
    ...base,
    type: "shape",
    shape: "rect",
    fill: options.color,
    radius: 0.18,
    // Un carré, quel que soit le format de la vignette.
    transform: { x: 0.5, y: 0.5, width: (0.46 * options.height) / options.width, height: 0.46, rotation: 0, opacity: 1 },
  };
  return shape;
}

/**
 * Scène d'une vignette : une entrée arrive, reste un instant, et recommence ;
 * une sortie part d'un élément au repos ; une mise en avant tourne deux fois
 * avec un court repos entre les tours.
 */
export function buildPreviewScene(preset: MotionPreset, phase: PickerPhase, options: PreviewOptions): PreviewScene {
  const showsText = previewShowsText(preset, options.itemType);
  const frames = previewPhaseFrames(preset, showsText, options.text || PREVIEW_WORD);
  const anim = options.params ? { kind: preset.id, frames, params: options.params } : { kind: preset.id, frames };
  let item: VisualItem;
  let loopFrames: number;
  let stillFrame: number;

  if (phase === "in") {
    item = { ...witness(preset, options, showsText, LEAD_FRAMES, frames + HOLD_FRAMES), animIn: anim };
    loopFrames = LEAD_FRAMES + frames + HOLD_FRAMES;
    stillFrame = LEAD_FRAMES + Math.floor(frames / 2);
  } else if (phase === "out") {
    item = { ...witness(preset, options, showsText, 0, HOLD_FRAMES + frames), animOut: anim };
    loopFrames = HOLD_FRAMES + frames + LEAD_FRAMES;
    stillFrame = HOLD_FRAMES + Math.floor(frames / 2);
  } else {
    // Une boucle tourne sans repos ; une mise en avant jouée une fois respire entre deux passages.
    const loops = preset.phase === "loop";
    const rest = loops ? 0 : Math.round(HOLD_FRAMES / 2);
    item = { ...witness(preset, options, showsText, 0, frames + rest), animEmphasis: { ...anim, at: 0, repeat: 1 } };
    loopFrames = frames + rest;
    stillFrame = Math.floor(frames / 2);
  }

  const project: ClipProject = {
    version: 1,
    id: "motion-preview",
    name: "Aperçu",
    aspect: "16:9",
    width: options.width,
    height: options.height,
    fps: PREVIEW_FPS,
    // Fond transparent : la vignette garde celui de sa carte (le canevas est vidé avant chaque image).
    background: "rgba(0,0,0,0)",
    tracks: [{ id: "preview", kind: "visual", name: "Aperçu", items: [item] }],
    createdAt: 0,
    updatedAt: 0,
  };
  return { project, loopFrames: Math.max(1, loopFrames), stillFrame };
}

/** Image d'un tour de vignette à un instant donné, en millisecondes depuis le survol. */
export function previewFrameAt(scene: Pick<PreviewScene, "loopFrames">, elapsedMs: number): number {
  const frame = Math.floor((Math.max(0, elapsedMs) / 1000) * PREVIEW_FPS);
  return frame % scene.loopFrames;
}
