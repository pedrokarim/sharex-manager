/**
 * Vignettes animées des transitions, des mouvements de caméra et des effets
 * de plan : un petit projet témoin dessiné par `drawFrame`, le même moteur
 * que l'aperçu et l'export.
 *
 * - une transition passe d'un aplat « A » à un aplat « B » ;
 * - un mouvement de caméra joue sur une image témoin (un paysage) ;
 * - un effet de plan frappe la même image, un instant après le début.
 *
 * Ce fichier ne dessine rien : les images témoins sont fournies par le
 * composant (`components/scene-thumbnail.tsx`) d'après `source.ref`.
 */

import { getShotFx, getTransition, isKnownTransition, listCameraMoves } from "../engine/motion/scenes";
import type { ClipProject, ImageItem, ShotEffect } from "../engine/types";
import type { SceneKind } from "./scene-catalog";

/** Cadence des vignettes. */
export const SCENE_PREVIEW_FPS = 30;

/** Références des images témoins, lues par le composant qui les dessine. */
export const WITNESS_REFS = {
  plateA: "scene-preview:plate-a",
  plateB: "scene-preview:plate-b",
  landscape: "scene-preview:landscape",
} as const;

export type WitnessRef = (typeof WITNESS_REFS)[keyof typeof WITNESS_REFS];

export interface ScenePreview {
  project: ClipProject;
  /** Longueur d'un tour, en images : la vignette boucle dessus. */
  loopFrames: number;
  /** Image montrée à l'arrêt. */
  stillFrame: number;
}

/** Aplat avant la transition, et image d'arrivée tenue après. */
const LEAD_FRAMES = 12;
const HOLD_FRAMES = 18;
/** Durée d'un mouvement qui couvre tout le plan, dans la vignette. */
const SPAN_FRAMES = 75;

const msToFrames = (ms: number) => Math.max(1, Math.round((ms / 1000) * SCENE_PREVIEW_FPS));

function witnessImage(id: string, ref: WitnessRef, start: number, duration: number, motion = "none"): ImageItem {
  return {
    id,
    type: "image",
    start,
    duration,
    source: { url: ref, ref, name: "Témoin", kind: "image", width: 640, height: 400 },
    fit: "cover",
    motion,
    radius: 0,
    transform: { x: 0.5, y: 0.5, width: 1, height: 1, rotation: 0, opacity: 1 },
    animIn: { kind: "none", frames: 0 },
    animOut: { kind: "none", frames: 0 },
  };
}

function project(width: number, height: number, items: ImageItem[], effects?: ShotEffect[]): ClipProject {
  return {
    version: 1,
    id: "scene-preview",
    name: "Aperçu",
    aspect: "16:9",
    width,
    height,
    fps: SCENE_PREVIEW_FPS,
    // Fond transparent : on voit celui de la vignette quand un plan rapetisse ou s'en va.
    background: "rgba(0,0,0,0)",
    tracks: [{ id: "scene-preview", kind: "visual", name: "Aperçu", items, ...(effects ? { effects } : {}) }],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Transition : l'aplat A, puis la transition vers l'aplat B, tenu un instant. `none` : coupe franche. */
export function buildTransitionPreview(kind: string, width: number, height: number): ScenePreview {
  const frames = kind && kind !== "none" ? msToFrames(isKnownTransition(kind) ? getTransition(kind).durationMs : 600) : 0;
  const second = witnessImage("b", WITNESS_REFS.plateB, LEAD_FRAMES, frames + HOLD_FRAMES);
  if (frames > 0) second.transition = { kind, frames };
  const items = [witnessImage("a", WITNESS_REFS.plateA, 0, LEAD_FRAMES), second];
  return {
    project: project(width, height, items),
    loopFrames: LEAD_FRAMES + frames + HOLD_FRAMES,
    // À l'arrêt, le milieu de la transition ; une coupe franche montre les deux aplats l'un après l'autre.
    stillFrame: frames > 0 ? LEAD_FRAMES + Math.floor(frames / 2) : 0,
  };
}

/**
 * Mouvement de caméra : un plan qui couvre tout le mouvement. Un mouvement
 * joué au début du plan est suivi d'un repos ; une boucle tourne une fois.
 */
export function buildCameraPreview(id: string, width: number, height: number): ScenePreview {
  const preset = listCameraMoves().find((entry) => entry.id === id);
  let duration = SPAN_FRAMES;
  let stillFrame = Math.floor(SPAN_FRAMES * 0.75);
  if (preset && preset.timing === "start" && preset.durationMs > 0) {
    const frames = msToFrames(preset.durationMs);
    duration = frames + HOLD_FRAMES;
    stillFrame = Math.max(1, Math.floor(frames * 0.2));
  } else if (preset && preset.timing === "loop" && preset.durationMs > 0) {
    duration = Math.min(msToFrames(preset.durationMs), SPAN_FRAMES * 2);
    stillFrame = Math.floor(duration / 4);
  }
  const item = witnessImage("camera", WITNESS_REFS.landscape, 0, duration, id || "none");
  return { project: project(width, height, [item]), loopFrames: duration, stillFrame };
}

/** Effet de plan : l'image témoin, frappée peu après le début, puis au repos. */
export function buildShotFxPreview(kind: string, width: number, height: number): ScenePreview {
  const frames = msToFrames(getShotFx(kind)?.durationMs ?? 330);
  const effect: ShotEffect = { kind, at: LEAD_FRAMES, frames };
  const duration = LEAD_FRAMES + frames + HOLD_FRAMES;
  const item = witnessImage("shot", WITNESS_REFS.landscape, 0, duration);
  return {
    project: project(width, height, [item], [effect]),
    loopFrames: duration,
    // À l'arrêt, juste après l'impact : un flash ou une secousse se voient encore.
    stillFrame: LEAD_FRAMES + Math.max(1, Math.floor(frames * 0.15)),
  };
}

export function buildScenePreview(kind: SceneKind, id: string, width: number, height: number): ScenePreview {
  if (kind === "transition") return buildTransitionPreview(id, width, height);
  if (kind === "camera") return buildCameraPreview(id, width, height);
  return buildShotFxPreview(id, width, height);
}

/** Image d'un tour de vignette à un instant donné, en millisecondes depuis le survol. */
export function scenePreviewFrameAt(preview: Pick<ScenePreview, "loopFrames">, elapsedMs: number): number {
  const frame = Math.floor((Math.max(0, elapsedMs) / 1000) * SCENE_PREVIEW_FPS);
  return frame % Math.max(1, preview.loopFrames);
}
