/**
 * Images clés d'un élément visuel : où il est, quelle taille il a et à
 * quel point il est visible, à une image donnée.
 *
 * Une image clé est un mouvement : à partir de son instant, chaque valeur
 * qu'elle nomme rejoint sa cible en `frames` images, depuis la valeur
 * atteinte juste avant. Les valeurs sont suivies séparément : une clé qui
 * ne déplace que `y` laisse `x` là où il est. La courbe par défaut est un
 * ressort amorti au plus juste : il arrive vite, ralentit, et ne dépasse
 * jamais sa cible (pas de rebond).
 *
 * Fonctions pures, partagées par l'aperçu et l'export (`render.ts`).
 */

import type { MoveEase, MoveKey, StrokePath, Transform, VisualItem } from "./types";
import { MAX_MOVE_KEYS } from "./types";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Raideur du ressort : à la fin du mouvement, il est à moins de 0,1 % de sa cible. */
const SPRING_RATE = 9;
const SPRING_END = 1 - (1 + SPRING_RATE) * Math.exp(-SPRING_RATE);

/** Avancement adouci d'un mouvement, de 0 à 1. */
export function moveEase(ease: MoveEase | undefined, progress: number): number {
  const p = clamp01(progress);
  switch (ease) {
    case "linear":
      return p;
    case "smooth":
      return p * p * (3 - 2 * p);
    case "in":
      return p * p * p;
    default: {
      // Réponse d'un ressort amorti au plus juste, ramenée pour finir exactement sur 1.
      const x = SPRING_RATE * p;
      return (1 - (1 + x) * Math.exp(-x)) / SPRING_END;
    }
  }
}

/** Valeurs qu'une image clé peut faire bouger. */
const KEYED = ["x", "y", "width", "height", "rotation", "opacity", "scale"] as const;
type Keyed = (typeof KEYED)[number];

/** Cadre d'un élément à une image : son `transform` animé, et son agrandissement. */
export interface KeyedFrame {
  transform: Transform;
  scale: number;
}

/** Images clés valables, dans l'ordre du temps (les autres sont ignorées). */
export function sortedKeys(keys: MoveKey[] | undefined): MoveKey[] {
  if (!Array.isArray(keys) || keys.length === 0) return [];
  return keys
    .filter((key) => key && Number.isFinite(key.at) && Number.isFinite(key.frames))
    .slice(0, MAX_MOVE_KEYS)
    .sort((a, b) => a.at - b.at);
}

/**
 * Valeur d'une propriété à l'image `local` (comptée depuis le début de
 * l'élément) : chaque clé qui la nomme part de la valeur atteinte à son
 * instant et rejoint sa cible ; une clé qui commence avant la fin de la
 * précédente reprend le mouvement là où il en est.
 */
function keyedValue(keys: MoveKey[], property: Keyed, base: number, local: number): number {
  let value = base;
  for (const key of keys) {
    const target = key[property];
    if (target === undefined || !Number.isFinite(target)) continue;
    if (local < key.at) break;
    const frames = Math.max(1, Math.round(key.frames));
    value = value + (target - value) * moveEase(key.ease, (local - key.at) / frames);
  }
  return value;
}

/** Cadre de l'élément à l'image `frame` du projet. Sans image clé : son `transform`, tel quel. */
export function keyedFrame(item: VisualItem, frame: number): KeyedFrame {
  const keys = sortedKeys(item.keys);
  if (keys.length === 0) return { transform: item.transform, scale: 1 };
  const local = frame - item.start;
  const base = item.transform;
  const transform: Transform = {
    x: keyedValue(keys, "x", base.x, local),
    y: keyedValue(keys, "y", base.y, local),
    width: Math.max(0, keyedValue(keys, "width", base.width, local)),
    height: Math.max(0, keyedValue(keys, "height", base.height, local)),
    rotation: keyedValue(keys, "rotation", base.rotation, local),
    opacity: clamp01(keyedValue(keys, "opacity", base.opacity, local)),
  };
  return { transform, scale: Math.max(0, keyedValue(keys, "scale", 1, local)) };
}

/** L'élément tel qu'il est dessiné à l'image `frame` : son cadre animé (et son agrandissement à part). */
export function itemAtFrame<T extends VisualItem>(item: T, frame: number): { item: T; scale: number } {
  if (!item.keys?.length) return { item, scale: 1 };
  const { transform, scale } = keyedFrame(item, frame);
  return { item: { ...item, transform }, scale };
}

/**
 * Images clés d'un élément dont le début se décale de `delta` images
 * (moitié droite d'une coupe, début rogné) : chaque instant recule
 * d'autant, au besoin sous zéro. Le mouvement est exactement celui d'avant,
 * sans saut à la coupe.
 */
export function shiftKeys(keys: MoveKey[] | undefined, delta: number): MoveKey[] | undefined {
  if (!keys?.length || delta === 0) return keys;
  return keys.map((key) => ({ ...key, at: key.at - delta }));
}

/** Tracés dont l'instant de dessin recule de `delta` images ; un tracé fini avant la coupe reste entier. */
export function shiftStrokePaths(paths: StrokePath[], delta: number): StrokePath[] {
  if (delta === 0) return paths;
  return paths.map((path) => {
    if (!path.draw) return path;
    if (path.draw.at + path.draw.frames <= delta) {
      const { draw: _draw, ...rest } = path;
      return rest;
    }
    return { ...path, draw: { ...path.draw, at: path.draw.at - delta } };
  });
}

/** Ce qu'un décalage du début de `delta` images change dans un élément visuel. */
export function shiftTimed(item: VisualItem, delta: number): Partial<VisualItem> {
  const patch: Partial<VisualItem> = {};
  if (item.keys?.length) patch.keys = shiftKeys(item.keys, delta);
  if (item.type === "shape" && item.stroke) (patch as Partial<typeof item>).stroke = { ...item.stroke, paths: shiftStrokePaths(item.stroke.paths, delta) };
  return patch;
}
