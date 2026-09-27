/**
 * Calculs de chronologie, purs et partagés entre l'aperçu et l'export.
 *
 * Un élément ne peut pas durer 3 s dans l'aperçu et 3,2 s à l'export : les
 * deux passent par ces fonctions.
 */

import type {
  Anim,
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

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** Léger dépassement, pour l'apparition « pop ». */
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// ─── Animations d'entrée et de sortie ────────────────────────────

export interface AnimState {
  opacity: number;
  /** Décalage relatif au canevas. */
  dx: number;
  dy: number;
  scale: number;
  /** Part révélée (texte « machine à écrire », balayage). */
  reveal: number;
  /** Balayage : révèle de gauche à droite. */
  wipe: number;
}

const IDLE: AnimState = { opacity: 1, dx: 0, dy: 0, scale: 1, reveal: 1, wipe: 1 };

function applyAnim(anim: Anim, t: number, entering: boolean): Partial<AnimState> {
  // t va de 0 (début de l'animation) à 1 (état de repos) à l'entrée, et de 1
  // (repos) à 0 (disparu) à la sortie : la même formule sert aux deux sens.
  const k = entering ? ease.outCubic(t) : ease.inCubic(t);
  const offset = 1 - k;
  switch (anim.kind) {
    case "fade":
      return { opacity: k };
    case "slide-up":
      return { opacity: k, dy: 0.08 * offset };
    case "slide-down":
      return { opacity: k, dy: -0.08 * offset };
    case "slide-left":
      return { opacity: k, dx: 0.12 * offset };
    case "slide-right":
      return { opacity: k, dx: -0.12 * offset };
    case "pop":
      return { opacity: clamp01(t * 2), scale: entering ? 0.4 + 0.6 * ease.outBack(t) : 0.6 + 0.4 * k };
    case "zoom":
      return { opacity: k, scale: 1.25 - 0.25 * k };
    case "typewriter":
      return { reveal: t };
    case "wipe":
      return { wipe: t };
    default:
      return {};
  }
}

export function animStateAt(item: VisualItem, frame: number): AnimState {
  const local = frame - item.start;
  const state = { ...IDLE };
  const inFrames = item.animIn.kind === "none" ? 0 : Math.min(item.animIn.frames, item.duration);
  const outFrames = item.animOut.kind === "none" ? 0 : Math.min(item.animOut.frames, item.duration - inFrames);

  if (inFrames > 0 && local < inFrames) {
    Object.assign(state, applyAnim(item.animIn, clamp01((local + 1) / inFrames), true));
  } else if (outFrames > 0 && local >= item.duration - outFrames) {
    const remaining = item.duration - local - 1;
    Object.assign(state, applyAnim(item.animOut, clamp01(remaining / outFrames), false));
  }
  return state;
}

// ─── Transitions ─────────────────────────────────────────────────

export interface TransitionState {
  kind: TransitionKind;
  /** 0 au début de la transition, 1 à la fin (adouci). */
  progress: number;
  /** Plan qui précède, collé au plan qui arrive ; absent en début de piste. */
  from: VisualItem | null;
}

/**
 * Transition en cours pour un plan à l'image donnée, s'il en a une. Le plan
 * précédent doit toucher le plan qui arrive ; sinon on transite depuis le fond.
 */
export function transitionAt(items: VisualItem[], item: VisualItem, frame: number): TransitionState | null {
  const transition = item.transition;
  if (!transition || transition.frames <= 0) return null;
  const frames = Math.min(transition.frames, item.duration);
  const local = frame - item.start;
  if (local < 0 || local >= frames) return null;
  const from = items.find((other) => other.id !== item.id && other.start + other.duration === item.start) ?? null;
  return { kind: transition.kind, progress: ease.inOutSine(clamp01((local + 1) / frames)), from };
}

// ─── Mouvement de caméra ─────────────────────────────────────────

export interface CameraState {
  /** Agrandissement supplémentaire appliqué à l'image. */
  zoom: number;
  /** Décalage du cadrage, en fraction de la marge disponible (-1 à 1). */
  panX: number;
  panY: number;
}

export function cameraAt(motion: Motion, progress: number): CameraState {
  const p = ease.inOutSine(clamp01(progress));
  switch (motion) {
    case "zoom-in":
      return { zoom: 1 + 0.15 * p, panX: 0, panY: 0 };
    case "zoom-out":
      return { zoom: 1.15 - 0.15 * p, panX: 0, panY: 0 };
    case "pan-left":
      return { zoom: 1.12, panX: 1 - 2 * p, panY: 0 };
    case "pan-right":
      return { zoom: 1.12, panX: -1 + 2 * p, panY: 0 };
    case "pan-up":
      return { zoom: 1.12, panX: 0, panY: 1 - 2 * p };
    case "pan-down":
      return { zoom: 1.12, panX: 0, panY: -1 + 2 * p };
    default:
      return { zoom: 1, panX: 0, panY: 0 };
  }
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
