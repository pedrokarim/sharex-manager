/**
 * Calculs de chronologie, purs et partagés entre l'aperçu et l'export.
 *
 * Un élément ne peut pas durer 3 s dans l'aperçu et 3,2 s à l'export : les
 * deux passent par ces fonctions.
 */

import { EASINGS } from "./motion/easing";
import {
  effectsAt,
  naturalFrames,
  naturalGridFrames,
  restState,
  sampleLayer,
  sampleTracks,
  type ActiveEffect,
} from "./motion/interpret";
import { getPreset } from "./motion/registry";
import { cameraValues, getCameraMove, getTransition, transitionProgress } from "./motion/scenes";
import { countUnits, type TextSplit } from "./motion/text-layout";
import type { MotionLayer, MotionParamValues, MotionPhase, MotionPreset, MotionState } from "./motion/types";
import type {
  Anim,
  AnimEmphasis,
  ClipItem,
  ClipProject,
  Motion,
  TransitionKind,
  VisualItem,
} from "./types";

/** Durée minimale d'un projet vide, pour que la timeline reste manipulable. */
const MIN_PROJECT_FRAMES = 30;

export function projectDuration(project: ClipProject): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const item of track.items) end = Math.max(end, item.start + item.duration);
  }
  return Math.max(end, MIN_PROJECT_FRAMES);
}

export function isActive(item: ClipItem, frame: number): boolean {
  return frame >= item.start && frame < item.start + item.duration;
}

export function framesToMs(frames: number, fps: number): number {
  return (frames / fps) * 1000;
}

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

export function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = frame / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((totalSeconds % 1) * 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

// ─── Courbes ─────────────────────────────────────────────────────

/**
 * Courbes nommées (`outCubic`, `inOutSine`, `outBack`…). La bibliothèque
 * complète, Bézier et ressorts compris, est dans `motion/easing.ts`.
 */
export const ease = EASINGS;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// ─── Animations d'entrée, de mise en avant et de sortie ──────────

/**
 * État d'un élément à une image : opacité, décalages, échelles, rotation,
 * flou, luminosité, révélation, balayage, découpe, couleur. Voir
 * `MotionState` ; un état au repos ne change rien au dessin.
 */
export type AnimState = MotionState;

/** Préréglage d'une animation pour une phase ; un identifiant inconnu vaut « none ». */
function presetOf(anim: Anim | undefined, phase: MotionPhase): MotionPreset | undefined {
  if (!anim || anim.kind === "none" || !(anim.frames > 0)) return undefined;
  if (phase === "emphasis") return getPreset(anim.kind, "emphasis") ?? getPreset(anim.kind, "loop");
  return getPreset(anim.kind, phase);
}

/** Couleur propre de l'élément, que les pistes de couleur désignent par `currentColor`. */
function baseColorOf(item: VisualItem): string | undefined {
  if (item.type === "text") return item.style.color;
  if (item.type === "shape") return item.fill;
  return undefined;
}

/**
 * Avancement d'une mise en avant à l'image `local` (comptée depuis le début
 * de l'élément), ou `null` hors de ses passages. Elle commence au plus tôt à
 * la fin de l'entrée et s'arrête net au début de la sortie, boucle comprise.
 */
export function emphasisProgress(
  emphasis: AnimEmphasis,
  local: number,
  inFrames: number,
  outStart: number
): number | null {
  const frames = Math.max(1, Math.round(emphasis.frames));
  const start = Math.max(inFrames, Math.round(Number(emphasis.at) || 0));
  if (local < start || local >= outStart) return null;
  const elapsed = local - start;
  const repeat = Math.max(0, Math.round(emphasis.repeat ?? 1));
  if (repeat > 0 && elapsed >= repeat * frames) return null;
  return ((elapsed % frames) + 1) / frames;
}

/** Phase jouée par un élément à une image donnée. */
export interface ActivePhase {
  phase: "in" | "out" | "emphasis";
  preset: MotionPreset;
  params?: MotionParamValues;
  /** Image dans la phase, de 0 à `frames - 1`. */
  local: number;
  /** Durée de la phase, en images (un passage, pour une mise en avant). */
  frames: number;
  /** Avancement : `(local + 1) / frames`, 1 sur la dernière image. */
  progress: number;
}

/** Phase d'animation en cours à l'image `frame`, ou `null` au repos. */
export function activePhaseAt(item: VisualItem, frame: number): ActivePhase | null {
  const local = frame - item.start;
  const animIn = presetOf(item.animIn, "in");
  const animOut = presetOf(item.animOut, "out");
  const inFrames = animIn ? Math.min(item.animIn.frames, item.duration) : 0;
  const outFrames = animOut ? Math.min(item.animOut.frames, item.duration - inFrames) : 0;

  // L'avancement va de 0 à 1 dans chaque phase, et vaut 1 sur sa dernière
  // image : l'entrée finit au repos, la sortie finit disparue.
  if (animIn && inFrames > 0 && local < inFrames) {
    const progress = clamp01((local + 1) / inFrames);
    return { phase: "in", preset: animIn, params: item.animIn.params, local, frames: inFrames, progress };
  }
  if (animOut && outFrames > 0 && local >= item.duration - outFrames) {
    const remaining = item.duration - local - 1;
    const progress = 1 - clamp01(remaining / outFrames);
    const start = item.duration - outFrames;
    return { phase: "out", preset: animOut, params: item.animOut.params, local: local - start, frames: outFrames, progress };
  }
  const emphasis = item.animEmphasis;
  const emphasisPreset = presetOf(emphasis, "emphasis");
  if (emphasis && emphasisPreset) {
    const progress = emphasisProgress(emphasis, local, inFrames, item.duration - outFrames);
    if (progress !== null) {
      const frames = Math.max(1, Math.round(emphasis.frames));
      const start = Math.max(inFrames, Math.round(Number(emphasis.at) || 0));
      return {
        phase: "emphasis",
        preset: emphasisPreset,
        params: emphasis.params,
        local: (local - start) % frames,
        frames,
        progress,
      };
    }
  }
  return null;
}

/**
 * Vrai si la phase anime le texte par unités (lignes, mots, lettres) : son
 * dessin est alors fait unité par unité (`render.ts`), et l'élément, lui,
 * reste au repos. Sur une image ou une forme, un tel préréglage s'applique
 * au bloc entier.
 */
export function isSplitText(item: VisualItem, preset: MotionPreset): boolean {
  return item.type === "text" && preset.split !== undefined && preset.split !== "whole";
}

/** Phase d'un texte découpé, avec son unité. */
export type SplitPhase = ActivePhase & { split: TextSplit };

/** Phase d'un texte découpé en cours à l'image `frame`, ou `null`. */
export function splitPhaseAt(item: VisualItem, frame: number): SplitPhase | null {
  if (item.type !== "text") return null;
  const active = activePhaseAt(item, frame);
  if (!active || !isSplitText(item, active.preset)) return null;
  return { ...active, split: active.preset.split as TextSplit };
}

export function animStateAt(item: VisualItem, frame: number): AnimState {
  return stateOfPhase(item, activePhaseAt(item, frame));
}

function stateOfPhase(item: VisualItem, active: ActivePhase | null): AnimState {
  // Texte découpé ou grille : chaque unité (ou carreau) porte son propre
  // état, le bloc ne bouge pas.
  if (!active || isSplitText(item, active.preset) || active.preset.grid) return restState();
  return sampleTracks(active.preset, active.progress, active.params, { baseColor: baseColorOf(item) });
}

// ─── Calques et effets ───────────────────────────────────────────

/** Calque à dessiner à une image, avec son état. */
export interface LayerSample {
  layer: MotionLayer;
  state: MotionState;
  preset: MotionPreset;
  /** Avancement de la phase qui le porte (1 pour un calque resté après son entrée). */
  progress: number;
  params?: MotionParamValues;
}

/** Tout ce qu'il faut pour dessiner un élément à une image. */
export interface ItemMotion {
  /** État du bloc (au repos pour un texte découpé ou une grille). */
  state: AnimState;
  /** Phase en cours, ou `null` au repos. */
  active: ActivePhase | null;
  /** Calques secondaires, dans leur ordre de déclaration. */
  layers: LayerSample[];
  /** Effets actifs de la phase en cours (brouillage, compteur, curseur…). */
  effects: ActiveEffect[];
}

const NO_LAYERS: LayerSample[] = [];
const NO_EFFECTS: ActiveEffect[] = [];

function samplesOf(
  item: VisualItem,
  preset: MotionPreset,
  progress: number,
  params: MotionParamValues | undefined,
  only?: (layer: MotionLayer) => boolean
): LayerSample[] {
  const samples: LayerSample[] = [];
  for (const layer of preset.layers ?? []) {
    if (only && !only(layer)) continue;
    samples.push({ layer, preset, progress, params, state: sampleLayer(preset, layer, progress, { baseColor: baseColorOf(item) }) });
  }
  return samples;
}

const persists = (layer: MotionLayer) => layer.persist === true;

/**
 * Calques restés en place hors de leur phase : ceux d'une entrée, à leur
 * état final, une fois l'entrée finie ; ceux d'une sortie, à leur état de
 * départ, avant qu'elle commence. Une entrée l'emporte sur une sortie (un
 * bandeau entré reste jusqu'à ce que sa sortie le reprenne).
 */
function standingLayers(item: VisualItem, active: ActivePhase | null): LayerSample[] {
  const animIn = presetOf(item.animIn, "in");
  const animOut = presetOf(item.animOut, "out");
  const fromIn = animIn?.layers?.some(persists) ?? false;
  const fromOut = animOut?.layers?.some(persists) ?? false;
  if (!fromIn && !fromOut) return NO_LAYERS;
  const phase = active?.phase;
  if (phase === "in") return NO_LAYERS;
  if (phase === "out") {
    // La sortie dessine ses propres calques ; sinon, ceux de l'entrée restent.
    if (animOut?.layers?.length) return NO_LAYERS;
    return fromIn ? samplesOf(item, animIn!, 1, item.animIn.params, persists) : NO_LAYERS;
  }
  if (fromIn) return samplesOf(item, animIn!, 1, item.animIn.params, persists);
  return samplesOf(item, animOut!, 0, item.animOut.params, persists);
}

/**
 * État, calques et effets d'un élément à une image. Un élément sans calque
 * ni effet rend exactement `animStateAt`, avec des listes vides.
 */
export function motionAt(item: VisualItem, frame: number): ItemMotion {
  const active = activePhaseAt(item, frame);
  const state = stateOfPhase(item, active);
  const own = active?.preset.layers?.length ? samplesOf(item, active.preset, active.progress, active.params) : NO_LAYERS;
  const standing = standingLayers(item, active);
  const layers = standing.length ? (own.length ? [...standing, ...own] : standing) : own;
  const effects = active?.preset.effects?.length ? effectsAt(active.preset, active.progress) : NO_EFFECTS;
  return { state, active, layers, effects };
}

/**
 * Durée naturelle, en images, d'une animation posée sur un élément : pour un
 * texte découpé, assez pour que chaque unité joue avec son décalage
 * (`naturalFrames`). L'inspecteur s'en sert pour proposer une durée ; une
 * durée plus courte reste valable, le décalage se resserre pour tenir.
 * `lineCount` donne le nombre de lignes réel quand on le connaît (sinon, un
 * paragraphe compte pour une ligne).
 */
export function suggestedAnimFrames(
  item: VisualItem,
  kind: string,
  phase: MotionPhase,
  fps: number,
  lineCount?: number
): number {
  const preset = presetOf({ kind, frames: 1 }, phase);
  if (!preset) return 0;
  if (preset.grid) return naturalGridFrames(preset, fps);
  const split = item.type === "text" ? preset.split ?? "whole" : "whole";
  if (split === "whole" || item.type !== "text") return naturalFrames(preset, 1, fps);
  const text = item.style.uppercase ? item.text.toUpperCase() : item.text;
  const count = split === "line" && lineCount !== undefined ? lineCount : countUnits(text, split);
  return naturalFrames(preset, count, fps);
}

// ─── Transitions ─────────────────────────────────────────────────

export interface TransitionState {
  kind: TransitionKind;
  /** 0 au début de la transition, 1 à la fin (adouci). */
  progress: number;
  /** Plan qui précède, collé au plan qui arrive ; absent en début de piste. */
  from: VisualItem | null;
}

/**
 * Transition en cours pour un plan à l'image donnée, s'il en a une. Le plan
 * précédent doit toucher le plan qui arrive ; sinon on transite depuis le fond.
 */
export function transitionAt(items: VisualItem[], item: VisualItem, frame: number): TransitionState | null {
  const transition = item.transition;
  if (!transition || transition.frames <= 0) return null;
  const frames = Math.min(transition.frames, item.duration);
  const local = frame - item.start;
  if (local < 0 || local >= frames) return null;
  const from = items.find((other) => other.id !== item.id && other.start + other.duration === item.start) ?? null;
  // Chaque transition adoucit l'avancement par sa courbe ; les cinq d'origine
  // gardent l'entrée-sortie en sinus de toujours.
  return { kind: transition.kind, progress: transitionProgress(getTransition(transition.kind), (local + 1) / frames), from };
}

// ─── Mouvement de caméra ─────────────────────────────────────────

export interface CameraState {
  /** Agrandissement supplémentaire appliqué à l'image. */
  zoom: number;
  /** Décalage du cadrage, en fraction de la marge disponible (-1 à 1). */
  panX: number;
  panY: number;
  /** Rotation de l'image dans son cadre, en degrés (absente : aucune). */
  rotate?: number;
  /** Petit décalage de l'image (secousse), en part de la boîte. */
  shiftX?: number;
  shiftY?: number;
  /** Flou, en part du petit côté de la boîte. */
  blur?: number;
  /** Luminosité (1 : inchangée). */
  brightness?: number;
}

/**
 * Cadrage d'une image : `progress` est l'avancement dans le plan (de 0 à 1),
 * `elapsedMs` le temps écoulé depuis son début (secousse au début du plan,
 * caméra à l'épaule en boucle). Les mouvements sont dans `motion/scenes.ts` ;
 * les sept d'origine rendent les mêmes valeurs qu'avant.
 */
export function cameraAt(motion: Motion | undefined, progress: number, elapsedMs = 0): CameraState {
  const values = cameraValues(getCameraMove(motion), progress, elapsedMs);
  const state: CameraState = { zoom: values.zoom, panX: values.panX, panY: values.panY };
  if (values.rotate) state.rotate = values.rotate;
  if (values.shiftX) state.shiftX = values.shiftX;
  if (values.shiftY) state.shiftY = values.shiftY;
  if (values.blur > 0) state.blur = values.blur;
  if (values.brightness !== 1) state.brightness = values.brightness;
  return state;
}

/** Vitesses proposées pour une vidéo. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export function speedOf(item: { speed?: number }): number {
  const speed = Number(item.speed);
  return Number.isFinite(speed) && speed > 0 ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)) : 1;
}

/** Instant, dans la source, lu par une vidéo à l'image `frame` du projet. */
export function sourceTimeAt(
  item: { start: number; trimStart: number; speed?: number },
  frame: number,
  fps: number
): number {
  return (item.trimStart + (frame - item.start) * speedOf(item)) / fps;
}
